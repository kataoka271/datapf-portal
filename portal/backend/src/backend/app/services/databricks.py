"""
Databricks service layer.
Wraps databricks-sql-connector for Delta Table access and
databricks-sdk for Unity Catalog / Permissions API calls.
"""

from __future__ import annotations

from typing import Any

from backend.app.config import get_settings


# ── SQL execution ─────────────────────────────────────────────────────────────
def _get_connection():
    """Return a databricks-sql-connector connection (not cached — short-lived)."""
    settings = get_settings()
    try:
        import databricks.sql as dbsql
        from databricks.sdk.core import Config

        cfg = Config()
        conn = dbsql.connect(
            server_hostname=cfg.host.replace("https://", ""),
            http_path=f"/sql/1.0/warehouses/{settings.databricks_sql_warehouse_id}",
            credentials_provider=cfg.authenticate,
        )
        return conn
    except Exception:
        return None  # dev mode fallback


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
            cols = [d[0] for d in cur.description or [""]]
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

        w = WorkspaceClient()
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

        w = WorkspaceClient()
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
            changes=[
                PermissionsChange(
                    add=[Privilege.ALL_PRIVILEGES],
                    principal=owner_group_name,
                )
            ],
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

        w = WorkspaceClient()
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
                    members.append(
                        {
                            "user_id": m.value,
                            "email": email,
                            "display_name": user_info.display_name or email,
                            "role": role,
                            "approved_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
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

        w = WorkspaceClient()
        user_info = w.users.get(user_id)
        return user_info.emails[0].value if user_info.emails else None
    except Exception:
        return None


def list_unity_catalogs(user_id: str, role_map: dict[str, str]) -> list[dict[str, Any]]:
    """List all Unity Catalog catalogs, merged with portal metadata and user access status."""
    settings = get_settings()
    if settings.dev_mode:
        return []

    _SYSTEM_CATALOGS = {"system", "hive_metastore", "__databricks_internal"}

    try:
        from datetime import datetime, timezone

        from databricks.sdk import WorkspaceClient

        w = WorkspaceClient()
        uc_catalogs = [c for c in w.catalogs.list() if c.name and c.name not in _SYSTEM_CATALOGS]

        portal_rows = execute_sql(
            f"SELECT * FROM {settings.portal_catalog}.governance.catalog_definitions WHERE status = 'ACTIVE'"
        )
        portal_meta = {r["catalog_name"]: r for r in portal_rows}

        # Latest request status per catalog for this user
        agreement_rows = execute_sql(
            f"""SELECT catalog_name, status
                FROM (
                    SELECT catalog_name, status,
                           ROW_NUMBER() OVER (PARTITION BY catalog_name ORDER BY agreed_at DESC) AS rn
                    FROM {settings.portal_catalog}.governance.mou_agreements
                    WHERE user_id = ?
                ) WHERE rn = 1""",
            (user_id,),
        )
        user_requests = {r["catalog_name"]: r["status"] for r in agreement_rows}

        result = []
        for cat in uc_catalogs:
            name = cat.name
            meta = portal_meta.get(name, {})
            user_role = role_map.get(name, "none")
            request_status = user_requests.get(name)
            if user_role in ("owner", "editor", "viewer"):
                request_status = "APPROVED"
            result.append({
                "catalog_name": name,
                "display_name": meta.get("display_name") or name,
                "description": meta.get("description") or getattr(cat, "comment", "") or "",
                "owner_user_id": meta.get("owner_user_id") or getattr(cat, "owner", "") or "",
                "my_role": user_role,
                "my_request_status": request_status,
                "requires_approval": meta.get("requires_approval", False),
                "status": "ACTIVE",
                "mou_version": meta.get("mou_version") or "",
                "updated_at": meta.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            })
        return result
    except Exception:
        return []


def get_user_catalog_roles(email: str) -> list[dict[str, str]]:
    """Get catalog roles for a user by checking their Databricks group membership."""
    settings = get_settings()
    if settings.dev_mode:
        return []
    try:
        from databricks.sdk import WorkspaceClient

        w = WorkspaceClient()
        users = list(w.users.list(filter=f'emails.value eq "{email}"', attributes="id"))
        if not users or not users[0].id:
            return []
        user_obj = w.users.get(users[0].id, attributes="groups")
        roles: list[dict[str, str]] = []
        for grp in user_obj.groups or []:
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


# ── Databricks Genie ─────────────────────────────────────────────────────────
def _get_workspace_client():
    from databricks.sdk import WorkspaceClient

    return WorkspaceClient()


def _parse_genie_result(result: Any, conversation_id: str) -> dict[str, Any]:
    """GenieMessage SDK オブジェクトから reply と query_result を抽出する。"""
    reply = ""
    query_result: dict[str, Any] | None = None

    attachments = getattr(result, "attachments", None) or []
    for att in attachments:
        # テキスト添付
        text_att = getattr(att, "text", None)
        if text_att:
            reply = getattr(text_att, "content", "") or ""
        # クエリ結果添付
        query_att = getattr(att, "query", None)
        if query_att:
            query_result_obj = getattr(query_att, "query_result", None)
            if query_result_obj:
                columns = [c.name for c in (getattr(query_result_obj, "columns", None) or [])]
                rows = []
                for row in getattr(query_result_obj, "data_typed_array", None) or []:
                    rows.append([getattr(v, "str", None) for v in (getattr(row, "values", None) or [])])
                query_result = {"columns": columns, "rows": rows}

    message_id = str(getattr(result, "id", "") or "")
    return {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "reply": reply,
        "query_result": query_result,
        "status": "COMPLETED",
    }


def genie_start_conversation(space_id: str, message: str) -> dict[str, Any]:
    """新規 Genie 会話を開始し、結果が出るまでポーリングして返す。"""
    w = _get_workspace_client()
    result = w.genie.start_conversation_and_wait(space_id, content=message)
    conversation_id = str(getattr(result, "conversation_id", "") or "")
    return _parse_genie_result(result, conversation_id)


def genie_send_message(space_id: str, conversation_id: str, message: str) -> dict[str, Any]:
    """既存 Genie 会話にメッセージを送り、結果が出るまでポーリングして返す。"""
    w = _get_workspace_client()
    result = w.genie.create_message_and_wait(space_id, conversation_id, content=message)
    return _parse_genie_result(result, conversation_id)


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
