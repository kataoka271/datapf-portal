"""
Mock data returned when DEV_MODE=true and Databricks is not connected.
Mirrors the real Delta Table schemas so switching to production only
requires removing the dev_mode guard in each router.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone

_NOW = datetime.now(timezone.utc)


def mock_catalogs(user_id: str) -> list[dict]:
    return [
        {
            "catalog_name": "vehicle_timeseries",
            "display_name": "車両時系列データ",
            "description": "走行軌跡・車速・加速度・エンジン状態を記録した時系列データ。全地域対応。",
            "owner_user_id": user_id,
            "my_role": "owner",
            "my_request_status": "APPROVED",
            "requires_approval": False,
            "status": "ACTIVE",
            "mou_version": "v3",
            "updated_at": (_NOW - timedelta(days=2)).isoformat(),
        },
        {
            "catalog_name": "fault_diagnostics",
            "display_name": "故障診断データ",
            "description": "DTC コード・センサー値・修理履歴を含む故障診断データ。要承認。",
            "owner_user_id": "suzuki@co.jp",
            "my_role": "none",
            "my_request_status": "PENDING",
            "requires_approval": True,
            "status": "ACTIVE",
            "mou_version": "v1",
            "updated_at": (_NOW - timedelta(days=5)).isoformat(),
        },
        {
            "catalog_name": "ev_battery_data",
            "display_name": "EV バッテリーデータ",
            "description": "EV バッテリー充放電・温度・劣化率の時系列データ。実験用ドメインデータ。",
            "owner_user_id": "ito@co.jp",
            "my_role": "none",
            "my_request_status": None,
            "requires_approval": False,
            "status": "ACTIVE",
            "mou_version": "v2",
            "updated_at": (_NOW - timedelta(days=10)).isoformat(),
        },
        {
            "catalog_name": "driver_behavior",
            "display_name": "ドライバー行動データ",
            "description": "ドライバー操作ログ・個人識別情報を含む行動データ。",
            "owner_user_id": "yamada@co.jp",
            "my_role": "none",
            "my_request_status": "REJECTED",
            "requires_approval": True,
            "status": "ACTIVE",
            "mou_version": "v1",
            "updated_at": (_NOW - timedelta(days=20)).isoformat(),
        },
    ]


def mock_mou(catalog_name: str) -> dict:
    return {
        "catalog_name": catalog_name,
        "version": "v3",
        "mou_text": f"""# {catalog_name} 利用規約

## 1. データ利用の目的

本データカタログへのアクセスは**業務目的**に限定されます。

## 2. 禁止事項

- データの第三者への開示・共有
- 個人を特定する目的での使用
- 営利目的での外部提供

## 3. セキュリティ要件

アクセス権限は本人のみに帰属し、共有は禁止します。
""",
        "checklist": [
            {
                "item_id": "ck-001",
                "label": "業務目的以外に使用しないことに同意する",
                "required": True,
            },
            {
                "item_id": "ck-002",
                "label": "第三者への開示・共有をしないことに同意する",
                "required": True,
            },
            {
                "item_id": "ck-003",
                "label": "セキュリティポリシーを理解していることを確認した",
                "required": False,
            },
        ],
        "updated_at": (_NOW - timedelta(days=3)).isoformat(),
    }


def mock_access_requests(catalog_name: str) -> list[dict]:
    return [
        {
            "agreement_id": "agr-001",
            "user_id": "sato-001",
            "display_name": "佐藤 太郎",
            "email": "sato@co.jp",
            "mou_version": "v3",
            "status": "PENDING",
            "agreed_at": (_NOW - timedelta(hours=2)).isoformat(),
            "decided_at": None,
        },
        {
            "agreement_id": "agr-002",
            "user_id": "kato-001",
            "display_name": "加藤 花子",
            "email": "kato@co.jp",
            "mou_version": "v3",
            "status": "PENDING",
            "agreed_at": (_NOW - timedelta(hours=26)).isoformat(),
            "decided_at": None,
        },
        {
            "agreement_id": "agr-003",
            "user_id": "watanabe-001",
            "display_name": "渡辺 次郎",
            "email": "watanabe@co.jp",
            "mou_version": "v2",
            "status": "APPROVED",
            "agreed_at": (_NOW - timedelta(days=8)).isoformat(),
            "decided_at": (_NOW - timedelta(days=7)).isoformat(),
        },
    ]


def mock_members(catalog_name: str) -> list[dict]:
    return [
        {
            "user_id": "watanabe-001",
            "email": "watanabe@co.jp",
            "display_name": "渡辺 次郎",
            "role": "viewer",
            "approved_at": (_NOW - timedelta(days=7)).isoformat(),
        },
        {
            "user_id": "tanaka-001",
            "email": "tanaka@co.jp",
            "display_name": "田中 三郎",
            "role": "editor",
            "approved_at": (_NOW - timedelta(days=30)).isoformat(),
        },
    ]


def mock_search_results(query: str) -> dict:
    cols = [
        {
            "catalog_name": "vehicle_timeseries",
            "schema_name": "drive",
            "table_name": "metrics",
            "column_name": "vehicle_speed",
            "description": "車両速度 (km/h)",
            "tags": ["speed"],
            "score": 0.94,
            "owner_user_id": "dev-user-001",
        },
        {
            "catalog_name": "vehicle_timeseries",
            "schema_name": "drive",
            "table_name": "metrics",
            "column_name": "accel_x",
            "description": "前後加速度 (G)",
            "tags": ["accel"],
            "score": 0.87,
            "owner_user_id": "dev-user-001",
        },
        {
            "catalog_name": "vehicle_timeseries",
            "schema_name": "drive",
            "table_name": "dynamics",
            "column_name": "lateral_g",
            "description": "横加速度 (G)",
            "tags": ["accel"],
            "score": 0.71,
            "owner_user_id": "dev-user-001",
        },
        {
            "catalog_name": "fault_diagnostics",
            "schema_name": "sensors",
            "table_name": "wheel",
            "column_name": "wheel_speed_fl",
            "description": "左前輪速度 (rpm)",
            "tags": ["speed"],
            "score": 0.65,
            "owner_user_id": "suzuki@co.jp",
        },
        {
            "catalog_name": "ev_battery_data",
            "schema_name": "sensors",
            "table_name": "battery",
            "column_name": "soc_percent",
            "description": "バッテリー残量 (%)",
            "tags": ["battery"],
            "score": 0.58,
            "owner_user_id": "ito@co.jp",
        },
    ]
    rows = []
    for i in range(10):
        t = (_NOW - timedelta(seconds=10 - i)).replace(microsecond=0)
        rows.append(
            {
                "timestamp": t.isoformat(),
                "vehicle_id": "VH-0042",
                "vehicle_speed": round(68.0 + random.uniform(-2, 4), 1),
                "accel_x": round(random.uniform(0.05, 0.25), 3),
            }
        )
    return {
        "matched_columns": cols,
        "preview_rows": rows,
        "join_key": "vehicle_id + timestamp",
    }


def mock_vehicles(region: str) -> list[dict]:
    base_coords = {
        "japan": (35.68, 139.69),
        "europe": (48.85, 2.35),
        "north_america": (40.71, -74.01),
    }
    lat, lng = base_coords.get(region, (35.68, 139.69))
    vehicles = []
    for i in range(12):
        vehicles.append(
            {
                "vehicle_id": f"VH-{i + 1:04d}",
                "latitude": round(lat + random.uniform(-0.3, 0.3), 5),
                "longitude": round(lng + random.uniform(-0.3, 0.3), 5),
                "heading": round(random.uniform(0, 360), 1),
                "speed_kmh": round(random.uniform(0, 120), 1),
                "recorded_at": _NOW.isoformat(),
            }
        )
    return vehicles


def mock_vehicle_status(vehicle_id: str) -> dict:
    return {
        "vehicle_id": vehicle_id,
        "recorded_at": _NOW.isoformat(),
        "has_video": True,
        "status_fields": [
            {
                "column_name": "vehicle_speed",
                "display_name": "車速",
                "value": round(random.uniform(40, 100), 1),
                "unit": "km/h",
            },
            {
                "column_name": "accel_x",
                "display_name": "前後加速度",
                "value": round(random.uniform(-0.3, 0.3), 3),
                "unit": "G",
            },
            {
                "column_name": "engine_temp",
                "display_name": "エンジン水温",
                "value": round(random.uniform(80, 100), 1),
                "unit": "°C",
            },
            {
                "column_name": "fuel_level",
                "display_name": "燃料残量",
                "value": round(random.uniform(20, 80), 1),
                "unit": "%",
            },
            {
                "column_name": "rpm",
                "display_name": "エンジン回転数",
                "value": random.randint(1200, 4500),
                "unit": "rpm",
            },
            {
                "column_name": "throttle",
                "display_name": "スロットル開度",
                "value": round(random.uniform(0, 60), 1),
                "unit": "%",
            },
        ],
    }


def mock_timeseries(vehicle_id: str, columns: list[str]) -> list[dict]:
    series = []
    for col in columns:
        col_name = col.split(".")[-1]
        data = []
        t = _NOW - timedelta(minutes=10)
        val = random.uniform(30, 90)
        for _ in range(120):
            val = max(0, val + random.uniform(-3, 3))
            data.append({"timestamp": t.isoformat(), "value": round(val, 2)})
            t += timedelta(seconds=5)
        series.append(
            {
                "column_full_name": col,
                "display_name": col_name,
                "unit": "km/h" if "speed" in col_name else None,
                "data": data,
            }
        )
    return series


def mock_statistics(columns: list[str], vehicle_id: str | None = None) -> list[dict]:
    stats = []
    for col in columns:
        col_name = col.split(".")[-1]
        vals = [random.gauss(65, 18) for _ in range(1000)]
        vals.sort()

        def pct(p):
            return vals[int(len(vals) * p / 100)]

        hist = []
        lo, hi, bins = 0.0, 130.0, 10
        step = (hi - lo) / bins
        for b in range(bins):
            bs, be = lo + b * step, lo + (b + 1) * step
            hist.append(
                {
                    "bin_start": round(bs, 1),
                    "bin_end": round(be, 1),
                    "count": sum(1 for v in vals if bs <= v < be),
                }
            )
        stats.append(
            {
                "column_full_name": col,
                "display_name": col_name,
                "count": len(vals),
                "null_count": random.randint(0, 20),
                "mean": round(sum(vals) / len(vals), 3),
                "stddev": round(
                    math.sqrt(sum((v - sum(vals) / len(vals)) ** 2 for v in vals) / len(vals)),
                    3,
                ),
                "min": round(vals[0], 3),
                "p25": round(pct(25), 3),
                "p50": round(pct(50), 3),
                "p75": round(pct(75), 3),
                "max": round(vals[-1], 3),
                "histogram": hist,
            }
        )
    return stats


def mock_apps() -> list[dict]:
    return [
        {
            "app_id": "app-001",
            "name": "DriveInsight Pro",
            "description": "走行データの高度な可視化・異常検知アプリ。vehicle_timeseries カタログを使用。",
            "owner_user_id": "analytics-team",
            "used_catalogs": ["vehicle_timeseries"],
            "is_subscribed": True,
            "redirect_url": "https://driveinsight.example.com",
        },
        {
            "app_id": "app-002",
            "name": "BatteryHealthDash",
            "description": "EV バッテリー劣化予測ダッシュボード。ev_battery_data カタログを使用。",
            "owner_user_id": "ev-team",
            "used_catalogs": ["ev_battery_data"],
            "is_subscribed": False,
            "redirect_url": None,
        },
        {
            "app_id": "app-003",
            "name": "FaultScan",
            "description": "故障診断データをもとにリアルタイムで異常を検知・アラート通知するアプリ。vehicle_timeseries / fault_diagnostics カタログを使用。",
            "owner_user_id": "dev-user-001",
            "used_catalogs": ["vehicle_timeseries", "fault_diagnostics"],
            "is_subscribed": True,
            "redirect_url": "https://faultscan.example.com",
        },
    ]


def mock_notifications() -> list[dict]:
    return [
        {
            "notification_id": "notif-001",
            "type": "APPROVAL",
            "title": "閲覧申請が承認されました",
            "body": "vehicle_timeseries へのアクセスが許可されました",
            "related_catalog": "vehicle_timeseries",
            "related_entity_id": "agr-001",
            "is_read": False,
            "created_at": (_NOW - timedelta(minutes=4)).isoformat(),
        },
        {
            "notification_id": "notif-002",
            "type": "QUALITY_ALERT",
            "title": "データ品質アラート — vehicle_timeseries",
            "body": "null_rate が閾値を超過しました (8.3% / 閾値 5.0%)",
            "related_catalog": "vehicle_timeseries",
            "related_entity_id": "alert-001",
            "is_read": False,
            "created_at": (_NOW - timedelta(hours=2)).isoformat(),
        },
        {
            "notification_id": "notif-003",
            "type": "ACCESS_REQUEST",
            "title": "新しい閲覧申請 — fault_diagnostics",
            "body": "sato@co.jp から閲覧申請が届きました",
            "related_catalog": "fault_diagnostics",
            "related_entity_id": "agr-002",
            "is_read": True,
            "created_at": (_NOW - timedelta(days=1)).isoformat(),
        },
        {
            "notification_id": "notif-004",
            "type": "SYSTEM_MESSAGE",
            "title": "システムメンテナンスのお知らせ",
            "body": "4/15 (火) 2:00〜4:00 にメンテナンスを実施します。その間ポータルは利用できません。",
            "related_catalog": None,
            "related_entity_id": None,
            "is_read": True,
            "created_at": (_NOW - timedelta(days=3)).isoformat(),
        },
    ]


def mock_alerts() -> list[dict]:
    return [
        {
            "alert_id": "alert-001",
            "catalog_name": "vehicle_timeseries",
            "table_full_name": "vehicle_timeseries.drive.metrics",
            "metric_name": "null_rate",
            "severity": "HIGH",
            "status": "OPEN",
            "threshold": 5.0,
            "actual_value": 8.3,
            "detail_message": "engine_temp カラムの NULL 率が 8.3% となり、設定閾値 5.0% を超過しました。データパイプラインの異常が疑われます。",
            "monitoring_run_id": "run-20250409-0312",
            "triggered_at": (_NOW - timedelta(hours=6)).isoformat(),
            "resolved_at": None,
        },
        {
            "alert_id": "alert-002",
            "catalog_name": "vehicle_timeseries",
            "table_full_name": "vehicle_timeseries.drive.metrics",
            "metric_name": "row_count_drop",
            "severity": "MEDIUM",
            "status": "OPEN",
            "threshold": -20.0,
            "actual_value": -42.0,
            "detail_message": "前日比でレコード数が 42% 減少しました。車両からのデータ送信が停止している可能性があります。",
            "monitoring_run_id": "run-20250408-0600",
            "triggered_at": (_NOW - timedelta(hours=30)).isoformat(),
            "resolved_at": None,
        },
        {
            "alert_id": "alert-003",
            "catalog_name": "vehicle_timeseries",
            "table_full_name": "vehicle_timeseries.drive.meta",
            "metric_name": "schema_change",
            "severity": "LOW",
            "status": "RESOLVED",
            "threshold": None,
            "actual_value": None,
            "detail_message": "新しいカラム 'obd_protocol_version' が追加されました。",
            "monitoring_run_id": "run-20250406-1422",
            "triggered_at": (_NOW - timedelta(days=3)).isoformat(),
            "resolved_at": (_NOW - timedelta(days=2)).isoformat(),
        },
    ]
