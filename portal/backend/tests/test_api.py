"""
Unit tests for the portal backend.
Run with: pytest tests/ -v
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ── Auth ──────────────────────────────────────────────────────────────────────
def test_get_me():
    res = client.get("/v1/auth/me")
    assert res.status_code == 200
    data = res.json()
    assert "user_id" in data
    assert "email" in data
    assert "catalog_roles" in data


# ── Notifications ─────────────────────────────────────────────────────────────
def test_list_notifications():
    res = client.get("/v1/notifications")
    assert res.status_code == 200
    data = res.json()
    assert "total" in data
    assert "unread_count" in data
    assert "items" in data
    assert isinstance(data["items"], list)


def test_list_notifications_unread_only():
    res = client.get("/v1/notifications?is_read=false")
    assert res.status_code == 200
    data = res.json()
    assert all(not item["is_read"] for item in data["items"])


def test_mark_read():
    res = client.patch("/v1/notifications/notif-001/read")
    assert res.status_code == 200
    assert res.json()["is_read"] is True


def test_mark_all_read():
    res = client.patch("/v1/notifications/read-all")
    assert res.status_code == 200
    assert "updated_count" in res.json()


# ── Catalogs ──────────────────────────────────────────────────────────────────
def test_list_catalogs():
    res = client.get("/v1/catalogs")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] > 0
    item = data["items"][0]
    assert "catalog_name" in item
    assert "my_role" in item


def test_list_catalogs_search():
    res = client.get("/v1/catalogs?q=vehicle")
    assert res.status_code == 200
    data = res.json()
    assert all(
        "vehicle" in i["catalog_name"].lower() or "vehicle" in i.get("description", "").lower() for i in data["items"]
    )


def test_list_catalogs_subscribed():
    res = client.get("/v1/catalogs?subscribed=true")
    assert res.status_code == 200
    data = res.json()
    assert all(i["my_role"] not in ("none", None) for i in data["items"])


def test_get_catalog_detail():
    res = client.get("/v1/catalogs/vehicle_timeseries")
    assert res.status_code == 200
    data = res.json()
    assert data["catalog_name"] == "vehicle_timeseries"
    assert "schemas" in data


def test_get_catalog_not_found():
    res = client.get("/v1/catalogs/nonexistent_catalog")
    assert res.status_code == 404


def test_get_mou():
    res = client.get("/v1/catalogs/vehicle_timeseries/mou")
    assert res.status_code == 200
    data = res.json()
    assert "mou_text" in data
    assert "checklist" in data
    assert "version" in data


def test_get_members():
    res = client.get("/v1/catalogs/vehicle_timeseries/members")
    assert res.status_code == 200
    data = res.json()
    assert "members" in data
    assert isinstance(data["members"], list)


def test_list_access_requests():
    res = client.get("/v1/catalogs/vehicle_timeseries/access-requests")
    assert res.status_code == 200
    data = res.json()
    assert "total" in data
    assert "items" in data


def test_list_access_requests_filtered():
    res = client.get("/v1/catalogs/vehicle_timeseries/access-requests?status=PENDING")
    assert res.status_code == 200
    data = res.json()
    assert all(i["status"] == "PENDING" for i in data["items"])


def test_create_access_request():
    payload = {
        "mou_version": "v3",
        "checklist_responses": [
            {"item_id": "ck-001", "checked": True},
            {"item_id": "ck-002", "checked": True},
            {"item_id": "ck-003", "checked": False},
        ],
    }
    res = client.post("/v1/catalogs/ev_battery_data/access-requests", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "agreement_id" in data
    assert data["status"] in ("APPROVED", "PENDING")


def test_decide_access_request():
    payload = {"action": "approve"}
    res = client.patch("/v1/catalogs/vehicle_timeseries/access-requests/agr-001", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "APPROVED"


def test_decide_access_request_reject():
    payload = {"action": "reject", "notes": "要件を満たしていません"}
    res = client.patch("/v1/catalogs/vehicle_timeseries/access-requests/agr-002", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "REJECTED"


def test_revoke_access_request():
    res = client.delete("/v1/catalogs/vehicle_timeseries/access-requests/agr-003")
    assert res.status_code == 200
    assert res.json()["deleted"] is True


# ── Cross search ───────────────────────────────────────────────────────────────
def test_cross_search():
    payload = {"query": "車速と加速度"}
    res = client.post("/v1/catalogs/search", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "matched_columns" in data
    assert "preview_rows" in data
    assert len(data["matched_columns"]) > 0
    col = data["matched_columns"][0]
    assert "catalog_name" in col
    assert "column_name" in col
    assert "score" in col


def test_save_view():
    payload = {
        "view_name": "test_view",
        "target_schema": "my_catalog.my_schema",
        "matched_columns": [
            {
                "catalog_name": "vehicle_timeseries",
                "schema_name": "drive",
                "table_name": "metrics",
                "column_name": "vehicle_speed",
                "description": "車速",
                "tags": ["speed"],
                "score": 0.94,
            }
        ],
    }
    res = client.post("/v1/catalogs/search/views", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "view_full_name" in data
    assert "ddl" in data


# ── Apps ──────────────────────────────────────────────────────────────────────
def test_list_apps():
    res = client.get("/v1/apps")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] > 0
    app_item = data["items"][0]
    assert "app_id" in app_item
    assert "name" in app_item
    assert "is_subscribed" in app_item


def test_list_apps_subscribed_only():
    res = client.get("/v1/apps?subscribed=true")
    assert res.status_code == 200
    data = res.json()
    assert all(i["is_subscribed"] for i in data["items"])


def test_get_app():
    res = client.get("/v1/apps/app-001")
    assert res.status_code == 200
    assert res.json()["app_id"] == "app-001"


def test_get_app_not_found():
    res = client.get("/v1/apps/nonexistent")
    assert res.status_code == 404


def test_subscribe_app():
    res = client.post("/v1/apps/app-002/subscriptions", json={})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ACTIVE"


def test_unsubscribe_app():
    res = client.delete("/v1/apps/app-001/subscriptions")
    assert res.status_code == 200
    assert res.json()["deleted"] is True


def test_redirect_token():
    res = client.post("/v1/apps/app-001/redirect-token", json={})
    assert res.status_code == 200
    data = res.json()
    assert "redirect_url" in data
    assert "expires_in" in data


# ── Analysis ──────────────────────────────────────────────────────────────────
def test_get_vehicles():
    payload = {"region": "japan", "at_time": "2025-04-09T12:00:00Z"}
    res = client.post("/v1/analysis/vehicles", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "vehicles" in data
    assert len(data["vehicles"]) > 0
    v = data["vehicles"][0]
    assert "vehicle_id" in v
    assert "latitude" in v
    assert "longitude" in v


def test_get_vehicle_status():
    res = client.get("/v1/analysis/vehicles/VH-0001/status?at_time=2025-04-09T12:00:00Z")
    assert res.status_code == 200
    data = res.json()
    assert data["vehicle_id"] == "VH-0001"
    assert "status_fields" in data
    assert len(data["status_fields"]) > 0


def test_get_vehicle_timeseries():
    payload = {
        "columns": ["vehicle_timeseries.drive.metrics.vehicle_speed"],
        "time_from": "2025-04-09T11:50:00Z",
        "time_to": "2025-04-09T12:00:00Z",
    }
    res = client.post("/v1/analysis/vehicles/VH-0001/timeseries", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "series" in data
    assert len(data["series"]) == 1
    series = data["series"][0]
    assert "data" in series
    assert len(series["data"]) > 0


def test_get_vehicle_video():
    res = client.get("/v1/analysis/vehicles/VH-0001/video?at_time=2025-04-09T12:00:00Z")
    assert res.status_code == 200
    data = res.json()
    assert "presigned_url" in data
    assert "duration_sec" in data


def test_get_statistics():
    payload = {
        "region": "japan",
        "time_from": "2025-04-01T00:00:00Z",
        "time_to": "2025-04-09T00:00:00Z",
        "columns": [
            "vehicle_timeseries.drive.metrics.vehicle_speed",
            "vehicle_timeseries.drive.metrics.engine_temp",
        ],
    }
    res = client.post("/v1/analysis/statistics", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "stats" in data
    assert len(data["stats"]) == 2
    stat = data["stats"][0]
    for field in (
        "mean",
        "stddev",
        "min",
        "max",
        "p25",
        "p50",
        "p75",
        "count",
        "histogram",
    ):
        assert field in stat


# ── Alerts ────────────────────────────────────────────────────────────────────
def test_list_alerts():
    res = client.get("/v1/alerts")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] > 0
    alert = data["items"][0]
    assert "alert_id" in alert
    assert "severity" in alert
    assert "status" in alert


def test_list_alerts_open_only():
    res = client.get("/v1/alerts?status=OPEN")
    assert res.status_code == 200
    data = res.json()
    assert all(a["status"] == "OPEN" for a in data["items"])


def test_list_alerts_by_catalog():
    res = client.get("/v1/alerts?catalog_name=vehicle_timeseries")
    assert res.status_code == 200
    data = res.json()
    assert all(a["catalog_name"] == "vehicle_timeseries" for a in data["items"])


def test_get_alert():
    res = client.get("/v1/alerts/alert-001")
    assert res.status_code == 200
    data = res.json()
    assert data["alert_id"] == "alert-001"
    assert "detail_message" in data


def test_get_alert_not_found():
    res = client.get("/v1/alerts/nonexistent")
    assert res.status_code == 404


# ── Admin ─────────────────────────────────────────────────────────────────────
def test_list_users():
    res = client.get("/v1/admin/users")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] > 0
    assert "user_id" in data["items"][0]


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
