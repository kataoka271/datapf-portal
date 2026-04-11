"""
All Lambda API routers.
Each router corresponds to one section in the API endpoint design document.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import get_current_user, require_admin
from app.models import (
    CurrentUser, CreateCatalogRequest, UpdateMouRequest,
    UpdateMemberRequest, CreateAccessRequestBody, DecideAccessRequest,
    SearchRequest, SaveViewRequest,
    CreateAppRequest,
    VehiclesRequest, TimeseriesRequest, StatisticsRequest,
)
from app.config import get_settings
from app.services import databricks as db_svc
from app.services import mock_data as mock

_NOW = lambda: datetime.now(timezone.utc)   # noqa: E731


# ── Auth ──────────────────────────────────────────────────────────────────────
router_auth = APIRouter(prefix="/auth", tags=["auth"])

@router_auth.get("/me")
def get_me(user: CurrentUser = Depends(get_current_user)):
    return user


# ── Notifications ─────────────────────────────────────────────────────────────
router_notifications = APIRouter(prefix="/notifications", tags=["notifications"])

@router_notifications.get("")
def list_notifications(
    is_read: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    user: CurrentUser = Depends(get_current_user),
):
    settings = get_settings()
    all_notifs = mock.mock_notifications()   # dev mode
    if not settings.dev_mode:
        rows = db_svc.execute_sql(
            f"""SELECT * FROM {settings.portal_catalog}.notifications.inbox
                WHERE recipient_user_id = ?
                ORDER BY created_at DESC LIMIT ? OFFSET ?""",
            (user.user_id, limit, offset),
        )
        all_notifs = rows

    if is_read is not None:
        all_notifs = [n for n in all_notifs if n["is_read"] == is_read]

    unread_count = sum(1 for n in all_notifs if not n["is_read"])
    page = all_notifs[offset: offset + limit]
    return {"total": len(all_notifs), "unread_count": unread_count, "items": page}


@router_notifications.patch("/{notification_id}/read")
def mark_read(notification_id: str, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        db_svc.execute_sql(
            f"""MERGE INTO {settings.portal_catalog}.notifications.inbox AS t
                USING (SELECT ? AS id) AS s ON t.notification_id = s.id AND t.recipient_user_id = ?
                WHEN MATCHED THEN UPDATE SET is_read = true, read_at = current_timestamp()""",
            (notification_id, user.user_id),
        )
    return {"notification_id": notification_id, "is_read": True}


@router_notifications.patch("/read-all")
def mark_all_read(user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        db_svc.execute_sql(
            f"""UPDATE {settings.portal_catalog}.notifications.inbox
                SET is_read = true, read_at = current_timestamp()
                WHERE recipient_user_id = ? AND is_read = false""",
            (user.user_id,),
        )
    return {"updated_count": 0}


# ── Catalogs ──────────────────────────────────────────────────────────────────
router_catalogs = APIRouter(prefix="/catalogs", tags=["catalogs"])

@router_catalogs.get("")
def list_catalogs(
    q: Optional[str] = Query(None),
    subscribed: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    user: CurrentUser = Depends(get_current_user),
):
    settings = get_settings()
    items = mock.mock_catalogs(user.user_id)   # dev mode
    if not settings.dev_mode:
        items = db_svc.execute_sql(
            f"SELECT * FROM {settings.portal_catalog}.governance.catalog_definitions WHERE status = 'ACTIVE'",
        )
    if q:
        q_lower = q.lower()
        items = [i for i in items if q_lower in i["catalog_name"].lower() or q_lower in i.get("description","").lower()]
    if subscribed is True:
        items = [i for i in items if i.get("my_role") not in ("none", None)]
    total = len(items)
    return {"total": total, "items": items[offset: offset + limit]}


@router_catalogs.post("")
def create_catalog(body: CreateCatalogRequest, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        db_svc.create_unity_catalog(body.catalog_name, user.user_id)
        db_svc.execute_sql(
            f"""INSERT INTO {settings.portal_catalog}.governance.catalog_definitions
                VALUES (?,?,?,?,?,?,current_timestamp(),current_timestamp())""",
            (body.catalog_name, body.display_name, body.description, user.user_id,
             body.requires_approval, "ACTIVE"),
        )
    return {"catalog_name": body.catalog_name, "status": "CREATED"}


@router_catalogs.get("/{catalog_name}")
def get_catalog(catalog_name: str, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    items = mock.mock_catalogs(user.user_id)
    cat = next((c for c in items if c["catalog_name"] == catalog_name), None)
    if not cat:
        raise HTTPException(status_code=404, detail="カタログが見つかりません")
    return {**cat, "schemas": [
        {"schema_name": "drive", "table_count": 3},
        {"schema_name": "sensors", "table_count": 5},
    ]}


@router_catalogs.get("/{catalog_name}/mou")
def get_mou(catalog_name: str, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        rows = db_svc.execute_sql(
            f"""SELECT * FROM {settings.portal_catalog}.governance.mou_definitions
                WHERE catalog_name = ? AND is_current = true""",
            (catalog_name,),
        )
        if rows:
            import json as _json
            r = rows[0]
            r["checklist"] = _json.loads(r.get("checklist_json", "[]"))
            return r
    return mock.mock_mou(catalog_name)


@router_catalogs.put("/{catalog_name}/mou")
def update_mou(catalog_name: str, body: UpdateMouRequest, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    import json as _json
    if not settings.dev_mode:
        db_svc.execute_sql(
            f"""UPDATE {settings.portal_catalog}.governance.mou_definitions
                SET is_current = false WHERE catalog_name = ?""", (catalog_name,))
        new_ver = "v1"
        rows = db_svc.execute_sql(
            f"SELECT MAX(version) as v FROM {settings.portal_catalog}.governance.mou_definitions WHERE catalog_name = ?",
            (catalog_name,))
        if rows and rows[0].get("v"):
            n = int(rows[0]["v"].replace("v","")) + 1
            new_ver = f"v{n}"
        db_svc.execute_sql(
            f"""INSERT INTO {settings.portal_catalog}.governance.mou_definitions
                VALUES (uuid(),?,?,?,?,true,?,current_timestamp())""",
            (catalog_name, new_ver, body.mou_text, _json.dumps(body.checklist), user.user_id),
        )
        return {"catalog_name": catalog_name, "version": new_ver, "updated_at": _NOW().isoformat()}
    return {"catalog_name": catalog_name, "version": "v4", "updated_at": _NOW().isoformat()}


@router_catalogs.get("/{catalog_name}/members")
def get_members(catalog_name: str, role: Optional[str] = Query(None), user: CurrentUser = Depends(get_current_user)):
    members = mock.mock_members(catalog_name)
    if role:
        members = [m for m in members if m["role"] == role]
    return {"members": members}


@router_catalogs.patch("/{catalog_name}/members/{user_id}")
def update_member(catalog_name: str, user_id: str, body: UpdateMemberRequest, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        db_svc.revoke_catalog_viewer(catalog_name, user_id)
        db_svc.grant_catalog_viewer(catalog_name, user_id)
    return {"user_id": user_id, "role": body.role}


@router_catalogs.delete("/{catalog_name}/members/{user_id}")
def delete_member(catalog_name: str, user_id: str, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        db_svc.revoke_catalog_viewer(catalog_name, user_id)
    return {"deleted": True}


@router_catalogs.get("/{catalog_name}/access-requests")
def list_access_requests(
    catalog_name: str,
    status: Optional[str] = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    items = mock.mock_access_requests(catalog_name)
    if status:
        items = [i for i in items if i["status"] == status]
    return {"total": len(items), "items": items}


@router_catalogs.post("/{catalog_name}/access-requests")
def create_access_request(
    catalog_name: str,
    body: CreateAccessRequestBody,
    user: CurrentUser = Depends(get_current_user),
):
    settings = get_settings()
    import uuid as _uuid
    agreement_id = str(_uuid.uuid4())
    result_status = "APPROVED"

    # Check if catalog requires approval
    catalogs = mock.mock_catalogs(user.user_id)
    cat = next((c for c in catalogs if c["catalog_name"] == catalog_name), None)
    if cat and cat.get("requires_approval"):
        result_status = "PENDING"

    if not settings.dev_mode:
        import json as _json
        db_svc.execute_sql(
            f"""INSERT INTO {settings.portal_catalog}.governance.mou_agreements VALUES
                (?,?,?,?,?,?,?,current_timestamp(),NULL,NULL,NULL,NULL)""",
            (agreement_id, catalog_name, user.user_id,
             body.mou_version, body.mou_version,
             _json.dumps([r.model_dump() for r in body.checklist_responses]),
             result_status),
        )
        if result_status == "APPROVED":
            db_svc.grant_catalog_viewer(catalog_name, user.user_id)

    role_granted = "viewer" if result_status == "APPROVED" else None
    return {"agreement_id": agreement_id, "status": result_status, "role_granted": role_granted}


@router_catalogs.patch("/{catalog_name}/access-requests/{agreement_id}")
def decide_access_request(
    catalog_name: str,
    agreement_id: str,
    body: DecideAccessRequest,
    user: CurrentUser = Depends(get_current_user),
):
    settings = get_settings()
    new_status = "APPROVED" if body.action == "approve" else "REJECTED"
    if not settings.dev_mode:
        db_svc.execute_sql(
            f"""UPDATE {settings.portal_catalog}.governance.mou_agreements
                SET status=?, decided_at=current_timestamp(), decided_by=?, notes=?
                WHERE agreement_id=? AND catalog_name=?""",
            (new_status, user.user_id, body.notes, agreement_id, catalog_name),
        )
        if new_status == "APPROVED":
            rows = db_svc.execute_sql(
                f"SELECT user_id FROM {settings.portal_catalog}.governance.mou_agreements WHERE agreement_id=?",
                (agreement_id,),
            )
            if rows:
                db_svc.grant_catalog_viewer(catalog_name, rows[0]["user_id"])
    return {"agreement_id": agreement_id, "status": new_status, "decided_at": _NOW().isoformat()}


@router_catalogs.delete("/{catalog_name}/access-requests/{agreement_id}")
def revoke_access_request(
    catalog_name: str,
    agreement_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    settings = get_settings()
    if not settings.dev_mode:
        db_svc.execute_sql(
            f"""UPDATE {settings.portal_catalog}.governance.mou_agreements
                SET status='REVOKED', revoked_at=current_timestamp()
                WHERE agreement_id=? AND user_id=?""",
            (agreement_id, user.user_id),
        )
        db_svc.revoke_catalog_viewer(catalog_name, user.user_id)
    return {"deleted": True}


# ── Cross search ───────────────────────────────────────────────────────────────
router_search = APIRouter(prefix="/catalogs", tags=["search"])

@router_search.post("/search")
def cross_search(body: SearchRequest, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        # Production: call Databricks Vector Search API
        pass
    return mock.mock_search_results(body.query)


@router_search.post("/search/views")
def save_view(body: SaveViewRequest, user: CurrentUser = Depends(get_current_user)):
    import uuid as _uuid
    settings = get_settings()
    cols = ", ".join(
        f"{c.catalog_name}.{c.schema_name}.{c.table_name}.{c.column_name}"
        for c in body.matched_columns
    )
    ddl = f"CREATE OR REPLACE VIEW {body.target_schema}.{body.view_name} AS\nSELECT {cols}\nFROM ...;"
    view_id = str(_uuid.uuid4())
    view_full_name = f"{body.target_schema}.{body.view_name}"
    if not settings.dev_mode:
        db_svc.execute_ddl(ddl)
        db_svc.execute_sql(
            f"""INSERT INTO {settings.portal_catalog}.search.saved_views VALUES
                (?,?,?,?,?,'ACTIVE',current_timestamp(),NULL)""",
            (view_id, user.user_id, view_full_name, None, ddl),
        )
    return {
        "view_id": view_id,
        "view_full_name": view_full_name,
        "ddl": ddl,
        "description": "",
        "status": "ACTIVE",
        "created_at": _NOW().isoformat(),
    }


# ── Apps ──────────────────────────────────────────────────────────────────────
router_apps = APIRouter(prefix="/apps", tags=["apps"])

@router_apps.get("")
def list_apps(
    q: Optional[str] = Query(None),
    subscribed: Optional[bool] = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    items = mock.mock_apps()
    if q:
        items = [a for a in items if q.lower() in a["name"].lower()]
    if subscribed is True:
        items = [a for a in items if a["is_subscribed"]]
    return {"total": len(items), "items": items}


@router_apps.get("/{app_id}")
def get_app(app_id: str, user: CurrentUser = Depends(get_current_user)):
    apps = mock.mock_apps()
    app = next((a for a in apps if a["app_id"] == app_id), None)
    if not app:
        raise HTTPException(status_code=404, detail="アプリが見つかりません")
    return app


@router_apps.post("")
def create_app(body: CreateAppRequest, user: CurrentUser = Depends(get_current_user)):
    import uuid as _uuid
    settings = get_settings()
    app_id = str(_uuid.uuid4())
    if not settings.dev_mode:
        import json as _json
        db_svc.execute_sql(
            f"""INSERT INTO {settings.portal_catalog}.apps.app_registry VALUES
                (?,?,?,?,?,?,?,NULL,NULL,'ACTIVE',current_timestamp(),current_timestamp())""",
            (app_id, body.name, body.description, user.user_id, body.redirect_url,
             _json.dumps(body.used_catalog_names), _json.dumps(body.published_catalog_names or [])),
        )
    return {"app_id": app_id, "status": "ACTIVE"}


@router_apps.post("/{app_id}/subscriptions")
def subscribe_app(app_id: str, user: CurrentUser = Depends(get_current_user)):
    import uuid as _uuid
    settings = get_settings()
    sub_id = str(_uuid.uuid4())
    if not settings.dev_mode:
        db_svc.execute_sql(
            f"""MERGE INTO {settings.portal_catalog}.apps.app_subscriptions AS t
                USING (SELECT ? AS sid) AS s ON t.app_id = ? AND t.user_id = ?
                WHEN MATCHED THEN UPDATE SET status='ACTIVE', revoked_at=NULL
                WHEN NOT MATCHED THEN INSERT VALUES (?,?,?,ACTIVE,false,NULL,current_timestamp(),NULL)""",
            (sub_id, app_id, user.user_id, sub_id, app_id, user.user_id),
        )
    return {"app_id": app_id, "status": "ACTIVE", "cognito_provisioned": True}


@router_apps.delete("/{app_id}/subscriptions")
def unsubscribe_app(app_id: str, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        db_svc.execute_sql(
            f"""UPDATE {settings.portal_catalog}.apps.app_subscriptions
                SET status='REVOKED', revoked_at=current_timestamp()
                WHERE app_id=? AND user_id=?""",
            (app_id, user.user_id),
        )
    return {"deleted": True}


@router_apps.post("/{app_id}/redirect-token")
def redirect_token(app_id: str, user: CurrentUser = Depends(get_current_user)):
    apps = mock.mock_apps()
    app = next((a for a in apps if a["app_id"] == app_id), None)
    if not app or not app.get("redirect_url"):
        raise HTTPException(status_code=404, detail="アプリが見つかりません")
    base_url = app["redirect_url"]
    return {"redirect_url": f"{base_url}?token=mock-cognito-token", "expires_in": 300}


# ── Analysis ──────────────────────────────────────────────────────────────────
router_analysis = APIRouter(prefix="/analysis", tags=["analysis"])

@router_analysis.post("/vehicles")
def get_vehicles(body: VehiclesRequest, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        rows = db_svc.execute_sql(
            """SELECT vehicle_id, latitude, longitude, heading, vehicle_speed AS speed_kmh, recorded_at
               FROM vehicle_timeseries.drive.metrics
               WHERE region = ? AND recorded_at BETWEEN ? AND ?""",
            (body.region, body.at_time, body.at_time),
        )
        return {"vehicles": rows}
    return {"vehicles": mock.mock_vehicles(body.region)}


@router_analysis.get("/vehicles/{vehicle_id}/status")
def get_vehicle_status(
    vehicle_id: str,
    at_time: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
):
    return mock.mock_vehicle_status(vehicle_id)


@router_analysis.post("/vehicles/{vehicle_id}/timeseries")
def get_vehicle_timeseries(
    vehicle_id: str,
    body: TimeseriesRequest,
    user: CurrentUser = Depends(get_current_user),
):
    series = mock.mock_timeseries(vehicle_id, body.columns)
    return {"vehicle_id": vehicle_id, "series": series}


@router_analysis.get("/vehicles/{vehicle_id}/video")
def get_vehicle_video(
    vehicle_id: str,
    at_time: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
):
    key = f"videos/{vehicle_id}/2025-04-09T12:00:00.mp4"
    url = db_svc.get_video_presigned_url(key)
    return {
        "vehicle_id": vehicle_id,
        "video_key": key,
        "presigned_url": url,
        "expires_at": _NOW().isoformat(),
        "duration_sec": 300,
        "recorded_at": at_time,
    }


@router_analysis.post("/statistics")
def get_statistics(body: StatisticsRequest, user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.dev_mode:
        # Production: execute PERCENTILE_CONT / STDDEV queries per column
        pass
    return {"stats": mock.mock_statistics(body.columns)}


# ── Alerts ────────────────────────────────────────────────────────────────────
router_alerts = APIRouter(prefix="/alerts", tags=["alerts"])

@router_alerts.get("")
def list_alerts(
    catalog_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    user: CurrentUser = Depends(get_current_user),
):
    items = mock.mock_alerts()
    if catalog_name:
        items = [a for a in items if a["catalog_name"] == catalog_name]
    if status:
        items = [a for a in items if a["status"] == status]
    return {"total": len(items), "items": items[offset: offset + limit]}


@router_alerts.get("/{alert_id}")
def get_alert(alert_id: str, user: CurrentUser = Depends(get_current_user)):
    alerts = mock.mock_alerts()
    alert = next((a for a in alerts if a["alert_id"] == alert_id), None)
    if not alert:
        raise HTTPException(status_code=404, detail="アラートが見つかりません")
    return alert


# ── Admin ─────────────────────────────────────────────────────────────────────
router_admin = APIRouter(prefix="/admin", tags=["admin"])

@router_admin.get("/users")
def list_users(
    q: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    user: CurrentUser = Depends(require_admin),
):
    # dev: return mock users
    return {"total": 3, "items": [
        {"user_id": "dev-user-001", "email": "dev@example.com", "display_name": "開発ユーザー", "is_admin": True, "catalog_count": 2, "last_login_at": _NOW().isoformat()},
        {"user_id": "sato-001",    "email": "sato@co.jp",       "display_name": "佐藤 太郎",   "is_admin": False, "catalog_count": 0, "last_login_at": _NOW().isoformat()},
        {"user_id": "tanaka-001",  "email": "tanaka@co.jp",     "display_name": "田中 三郎",   "is_admin": False, "catalog_count": 1, "last_login_at": _NOW().isoformat()},
    ]}


@router_admin.post("/notifications")
def send_notification(
    body: dict,
    user: CurrentUser = Depends(require_admin),
):
    import uuid as _uuid
    return {"notification_ids": [str(_uuid.uuid4())], "recipient_count": 1}
