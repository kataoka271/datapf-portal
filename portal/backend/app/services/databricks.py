"""
Databricks service layer.
Wraps databricks-sql-connector for Delta Table access and
databricks-sdk for Unity Catalog / Permissions API calls.
"""

from __future__ import annotations

from typing import Any

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
            credentials_provider=lambda: {"Authorization": f"Bearer {_get_sp_token()}"},
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


def grant_catalog_editor(catalog_name: str, user_id: str) -> None:
    """Add user to catalog-editor-{catalog_name} Databricks group."""
    _modify_group_member(f"catalog-editor-{catalog_name}", user_id, add=True)


def revoke_catalog_editor(catalog_name: str, user_id: str) -> None:
    _modify_group_member(f"catalog-editor-{catalog_name}", user_id, add=False)


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
        from databricks.sdk.service.iam import Patch, PatchOp, PatchSchema

        groups = list(w.groups.list(filter=f'displayName eq "{group_name}"'))
        if not groups:
            return
        group = groups[0]
        if not group.id:
            return
        if add:
            w.groups.patch(
                group.id,
                operations=[Patch(op=PatchOp.ADD, path="members", value=[{"value": user_id}])],
                schemas=[PatchSchema.URN_IETF_PARAMS_SCIM_API_MESSAGES_2_0_PATCH_OP],
            )
        else:
            members = group.members or []
            for m in members:
                if m.value == user_id:
                    w.groups.patch(
                        group.id,
                        operations=[Patch(op=PatchOp.REMOVE, path=f'members[value eq "{user_id}"]')],
                        schemas=[PatchSchema.URN_IETF_PARAMS_SCIM_API_MESSAGES_2_0_PATCH_OP],
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
        from databricks.sdk.service.catalog import PermissionsChange, Privilege, SecurableType

        w = WorkspaceClient(
            host=settings.databricks_host,
            client_id=settings.databricks_sp_client_id,
            client_secret=settings.databricks_sp_client_secret,
        )
        w.catalogs.create(name=catalog_name, comment=f"Created by portal for {owner_user_id}")

        # Create owner group if it doesn't exist
        owner_group_name = f"catalog-owner-{catalog_name}"
        groups = list(w.groups.list(filter=f'displayName eq "{owner_group_name}"'))
        if not groups:
            w.groups.create(display_name=owner_group_name)
            groups = list(w.groups.list(filter=f'displayName eq "{owner_group_name}"'))
        if groups and groups[0].id:
            from databricks.sdk.service.iam import Patch, PatchOp, PatchSchema

            w.groups.patch(
                groups[0].id,
                operations=[Patch(op=PatchOp.ADD, path="members", value=[{"value": owner_user_id}])],
                schemas=[PatchSchema.URN_IETF_PARAMS_SCIM_API_MESSAGES_2_0_PATCH_OP],
            )

        # Grant ALL PRIVILEGES on the catalog to the owner group
        w.grants.update(
            full_name=catalog_name,
            securable_type=SecurableType.CATALOG,
            changes=[PermissionsChange(
                add=[Privilege.ALL_PRIVILEGES],
                principal=owner_group_name,
            )],
        )
    except Exception:
        pass


def get_catalog_members(catalog_name: str) -> list[dict[str, Any]]:
    """List catalog members by querying Databricks group membership."""
    settings = get_settings()
    if settings.dev_mode:
        return []
    try:
        from datetime import datetime, timezone

        from databricks.sdk import WorkspaceClient

        w = WorkspaceClient(
            host=settings.databricks_host,
            client_id=settings.databricks_sp_client_id,
            client_secret=settings.databricks_sp_client_secret,
        )
        members: list[dict[str, Any]] = []
        for role in ("owner", "editor", "viewer"):
            group_name = f"catalog-{role}-{catalog_name}"
            groups = list(w.groups.list(filter=f'displayName eq "{group_name}"', attributes="id,members"))
            if not groups or not groups[0].members:
                continue
            for m in groups[0].members:
                try:
                    if not m.value:
                        continue
                    user_info = w.users.get(m.value)
                    email = user_info.emails[0].value if user_info.emails else ""
                    members.append({
                        "user_id": m.value,
                        "email": email,
                        "display_name": user_info.display_name or email,
                        "role": role,
                        "approved_at": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception:
                    pass
        return members
    except Exception:
        return []


def get_user_email(user_id: str) -> str | None:
    """Look up a user's email by their Databricks user ID."""
    settings = get_settings()
    if settings.dev_mode:
        return None
    try:
        from databricks.sdk import WorkspaceClient

        w = WorkspaceClient(
            host=settings.databricks_host,
            client_id=settings.databricks_sp_client_id,
            client_secret=settings.databricks_sp_client_secret,
        )
        user_info = w.users.get(user_id)
        return user_info.emails[0].value if user_info.emails else None
    except Exception:
        return None


def get_user_catalog_roles(email: str) -> list[dict[str, str]]:
    """Get catalog roles for a user by checking their Databricks group membership."""
    settings = get_settings()
    if settings.dev_mode:
        return []
    try:
        from databricks.sdk import WorkspaceClient

        w = WorkspaceClient(
            host=settings.databricks_host,
            client_id=settings.databricks_sp_client_id,
            client_secret=settings.databricks_sp_client_secret,
        )
        users = list(w.users.list(filter=f'emails.value eq "{email}"', attributes="id"))
        if not users or not users[0].id:
            return []
        user_obj = w.users.get(users[0].id, attributes="groups")
        roles: list[dict[str, str]] = []
        for grp in (user_obj.groups or []):
            name = grp.display
            if not name or not name.startswith("catalog-"):
                continue
            parts = name.split("-", 2)  # catalog-{role}-{catalog_name}
            if len(parts) == 3 and parts[1] in ("owner", "editor", "viewer"):
                roles.append({"catalog_name": parts[2], "role": parts[1]})
        return roles
    except Exception:
        return []


# ── S3 presigned URL ──────────────────────────────────────────────────────────
def get_video_presigned_url(object_key: str, expires_in: int = 3600) -> str:
    settings = get_settings()
    if settings.dev_mode:
        return f"https://example.com/mock-video/{object_key}?mock=true"
    import boto3  # type: ignore[import-untyped]

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
            "Body": {"Html": {"Data": body_html, "Charset": "UTF-8"}},
        },
    )
