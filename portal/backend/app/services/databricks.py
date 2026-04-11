"""
Databricks service layer.
Wraps databricks-sql-connector for Delta Table access and
databricks-sdk for Unity Catalog / Permissions API calls.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any
from functools import lru_cache

from app.config import get_settings


# ── SQL execution ─────────────────────────────────────────────────────────────
def _get_connection():
    """Return a databricks-sql-connector connection (not cached — short-lived)."""
    settings = get_settings()
    try:
        import databricks.sql as dbsql
        conn = dbsql.connect(
            server_hostname=settings.databricks_host.replace("https://", ""),
            http_path=f"/sql/1.0/warehouses/{settings.databricks_sql_warehouse_id}",
            credentials_provider=lambda: {
                "Authorization": f"Bearer {_get_sp_token()}"
            },
        )
        return conn
    except Exception:
        return None  # dev mode fallback


def _get_sp_token() -> str:
    """Get OAuth2 M2M token for the portal service principal."""
    settings = get_settings()
    if settings.dev_mode:
        return "dev-mock-pat"
    from databricks.sdk import WorkspaceClient
    w = WorkspaceClient(
        host=settings.databricks_host,
        client_id=settings.databricks_sp_client_id,
        client_secret=settings.databricks_sp_client_secret,
    )
    return w.config.token


def execute_sql(query: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Execute SQL against Databricks Serverless SQL Warehouse. Falls back to mock in dev."""
    settings = get_settings()
    if settings.dev_mode:
        return []  # Callers handle empty list and return mock data

    conn = _get_connection()
    if conn is None:
        return []
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def execute_ddl(ddl: str) -> None:
    """Execute a DDL statement (CREATE TABLE, CREATE VIEW, etc.)."""
    settings = get_settings()
    if settings.dev_mode:
        return

    conn = _get_connection()
    if conn is None:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(ddl)
    finally:
        conn.close()


# ── Unity Catalog: Permissions API ───────────────────────────────────────────
def grant_catalog_viewer(catalog_name: str, user_id: str) -> None:
    """Add user to catalog-viewer-{catalog_name} Databricks group."""
    _modify_group_member(f"catalog-viewer-{catalog_name}", user_id, add=True)


def revoke_catalog_viewer(catalog_name: str, user_id: str) -> None:
    _modify_group_member(f"catalog-viewer-{catalog_name}", user_id, add=False)


def _modify_group_member(group_name: str, user_id: str, add: bool) -> None:
    settings = get_settings()
    if settings.dev_mode:
        return
    try:
        from databricks.sdk import WorkspaceClient
        w = WorkspaceClient(
            host=settings.databricks_host,
            client_id=settings.databricks_sp_client_id,
            client_secret=settings.databricks_sp_client_secret,
        )
        groups = list(w.groups.list(filter=f"displayName eq \"{group_name}\""))
        if not groups:
            return
        group = groups[0]
        if add:
            w.groups.patch(
                group.id,
                operations=[{"op": "add", "path": "members", "value": [{"value": user_id}]}],
                schemas=["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            )
        else:
            members = group.members or []
            for m in members:
                if m.value == user_id:
                    w.groups.patch(
                        group.id,
                        operations=[{"op": "remove", "path": f"members[value eq \"{user_id}\"]"}],
                        schemas=["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                    )
                    break
    except Exception:
        pass  # log in production


def create_unity_catalog(catalog_name: str, owner_user_id: str) -> None:
    settings = get_settings()
    if settings.dev_mode:
        return
    try:
        from databricks.sdk import WorkspaceClient
        w = WorkspaceClient(
            host=settings.databricks_host,
            client_id=settings.databricks_sp_client_id,
            client_secret=settings.databricks_sp_client_secret,
        )
        w.catalogs.create(name=catalog_name, comment=f"Created by portal for {owner_user_id}")
    except Exception:
        pass


# ── S3 presigned URL ──────────────────────────────────────────────────────────
def get_video_presigned_url(object_key: str, expires_in: int = 3600) -> str:
    settings = get_settings()
    if settings.dev_mode:
        return f"https://example.com/mock-video/{object_key}?mock=true"
    import boto3
    s3 = boto3.client("s3", region_name=settings.aws_region)
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_video_bucket, "Key": object_key},
        ExpiresIn=expires_in,
    )


# ── SES email ─────────────────────────────────────────────────────────────────
def send_email(to: str, subject: str, body_html: str) -> None:
    settings = get_settings()
    if settings.dev_mode:
        print(f"[EMAIL] To: {to} | Subject: {subject}")
        return
    import boto3
    ses = boto3.client("ses", region_name=settings.aws_region)
    ses.send_email(
        Source=settings.aws_ses_sender,
        Destination={"ToAddresses": [to]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body":    {"Html": {"Data": body_html, "Charset": "UTF-8"}},
        },
    )
