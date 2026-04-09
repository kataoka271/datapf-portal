# バックエンド — Claude Code 指示書

## 技術スタック

| ライブラリ | バージョン | 用途 |
|---|---|---|
| FastAPI | 0.111 | Web フレームワーク |
| Pydantic v2 | 2.7 | リクエスト/レスポンス検証 |
| pydantic-settings | 2.3 | 環境変数管理 |
| Mangum | 0.17 | Lambda ハンドラアダプタ |
| databricks-sdk | 0.28 | Unity Catalog / Permissions API |
| databricks-sql-connector | 3.3 | Delta Table SQL クエリ |
| boto3 | 1.34 | AWS SES / S3 |
| python-jose | 3.3 | OIDC JWT 検証 |
| uvicorn | 0.30 | ローカル開発サーバー |

---

## ファイル構成

```
backend/
├── app/
│   ├── main.py              # FastAPI app 定義 + Lambda handler (Mangum)
│   ├── config.py            # Settings (pydantic-settings, .env 読み込み)
│   ├── auth.py              # OIDC トークン検証 / get_current_user 依存関係
│   ├── models.py            # Pydantic モデル全量（リクエスト・レスポンス）
│   ├── routers.py           # 全 31 エンドポイント実装
│   └── services/
│       ├── databricks.py    # Databricks/AWS サービス呼び出し層
│       └── mock_data.py     # DEV_MODE 用モックデータ
├── tests/
│   └── test_api.py          # 39 テストケース（全エンドポイント網羅）
├── requirements.txt
└── .env.example
```

---

## エンドポイント一覧

### プレフィックス: `/v1`

| メソッド | パス | 関数名 |
|---|---|---|
| GET | `/auth/me` | `get_me` |
| GET | `/notifications` | `list_notifications` |
| PATCH | `/notifications/{id}/read` | `mark_read` |
| PATCH | `/notifications/read-all` | `mark_all_read` |
| GET | `/catalogs` | `list_catalogs` |
| POST | `/catalogs` | `create_catalog` |
| GET | `/catalogs/{catalog_name}` | `get_catalog` |
| GET | `/catalogs/{catalog_name}/mou` | `get_mou` |
| PUT | `/catalogs/{catalog_name}/mou` | `update_mou` |
| GET | `/catalogs/{catalog_name}/members` | `get_members` |
| PATCH | `/catalogs/{catalog_name}/members/{user_id}` | `update_member` |
| DELETE | `/catalogs/{catalog_name}/members/{user_id}` | `delete_member` |
| GET | `/catalogs/{catalog_name}/access-requests` | `list_access_requests` |
| POST | `/catalogs/{catalog_name}/access-requests` | `create_access_request` |
| PATCH | `/catalogs/{catalog_name}/access-requests/{id}` | `decide_access_request` |
| DELETE | `/catalogs/{catalog_name}/access-requests/{id}` | `revoke_access_request` |
| POST | `/catalogs/search` | `cross_search` |
| POST | `/catalogs/search/views` | `save_view` |
| GET | `/apps` | `list_apps` |
| GET | `/apps/{app_id}` | `get_app` |
| POST | `/apps` | `create_app` |
| POST | `/apps/{app_id}/subscriptions` | `subscribe_app` |
| DELETE | `/apps/{app_id}/subscriptions` | `unsubscribe_app` |
| POST | `/apps/{app_id}/redirect-token` | `redirect_token` |
| POST | `/analysis/vehicles` | `get_vehicles` |
| GET | `/analysis/vehicles/{id}/status` | `get_vehicle_status` |
| POST | `/analysis/vehicles/{id}/timeseries` | `get_vehicle_timeseries` |
| GET | `/analysis/vehicles/{id}/video` | `get_vehicle_video` |
| POST | `/analysis/statistics` | `get_statistics` |
| GET | `/alerts` | `list_alerts` |
| GET | `/alerts/{alert_id}` | `get_alert` |
| GET | `/admin/users` | `list_users` |
| POST | `/admin/notifications` | `send_notification` |

---

## ルーターの実装パターン（必ず踏襲する）

すべてのエンドポイントは以下の二分岐パターンで実装する。
`DEV_MODE=true` ではモックデータを返し、`false` では Databricks/AWS を呼び出す。

```python
@router_catalogs.get("")
def list_catalogs(user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()

    # ① dev モード: モックデータを返す
    items = mock.mock_catalogs(user.user_id)

    # ② 本番モード: Delta Table / Databricks API を呼び出す
    if not settings.dev_mode:
        items = db_svc.execute_sql(
            f"SELECT * FROM {settings.portal_catalog}.governance.catalog_definitions",
        )

    return {"total": len(items), "items": items}
```

**重要**: 本番ブロックを先に書かず、必ずモック代入→本番上書きの順にする。
こうすることで `dev_mode` の値を変えるだけで切り替わる。

---

## Databricks サービス層の使い方

`app/services/databricks.py` の公開関数：

```python
from app.services import databricks as db_svc

# SQL クエリ実行（SELECT / INSERT / UPDATE / DELETE / MERGE）
rows = db_svc.execute_sql(
    "SELECT * FROM portal.governance.mou_agreements WHERE catalog_name = ?",
    (catalog_name,),
)

# DDL 実行（CREATE VIEW など）
db_svc.execute_ddl("CREATE OR REPLACE VIEW ...")

# Unity Catalog 権限付与・剥奪
db_svc.grant_catalog_viewer(catalog_name, user_id)
db_svc.revoke_catalog_viewer(catalog_name, user_id)

# Unity Catalog にカタログを新規作成
db_svc.create_unity_catalog(catalog_name, owner_user_id)

# S3 presigned URL 生成（動画アクセス）
url = db_svc.get_video_presigned_url("videos/VH-0001/2025-04-09.mp4")

# SES メール送信
db_svc.send_email("user@co.jp", "件名", "<p>本文</p>")
```

**DEV_MODE では全関数が即座に return するため、本番コードへの影響はない。**

---

## Pydantic モデルのルール

### リクエストボディ

```python
# models.py に定義する
class CreateFooRequest(BaseModel):
    name: str = Field(min_length=1)
    catalog_name: str = Field(pattern=r"^[a-zA-Z0-9_]+$")  # 制約はここで
    optional_field: Optional[str] = None

# ルーターで使う
@router.post("/foo")
def create_foo(body: CreateFooRequest, user: CurrentUser = Depends(get_current_user)):
    ...
```

### レスポンス

FastAPI の `response_model` は現状使っていない（型は dict で返却）。
新しいエンドポイントを追加する際も dict 返却で統一する。
型の厳密化が必要になった場合のみ `response_model` を追加する。

---

## 認証・認可の実装方法

```python
from app.auth import get_current_user, require_admin
from app.models import CurrentUser

# 認証済みユーザーが必要なエンドポイント（通常）
@router.get("/something")
def do_something(user: CurrentUser = Depends(get_current_user)):
    # user.user_id, user.email, user.catalog_roles が使える
    ...

# 管理者のみ
@router.get("/admin/something")
def admin_only(user: CurrentUser = Depends(require_admin)):
    ...
```

オーナー権限チェックの例（ルーター内で手動チェック）：

```python
owned = [r.catalog_name for r in user.catalog_roles if r.role == "owner"]
if catalog_name not in owned:
    raise HTTPException(status_code=403, detail="データオーナー権限が必要です")
```

---

## Delta Table SQL のルール

### テーブル名は設定から取得する

```python
settings = get_settings()
catalog = settings.portal_catalog  # デフォルト "portal"

db_svc.execute_sql(
    f"SELECT * FROM {catalog}.governance.mou_agreements WHERE status = ?",
    ("PENDING",),
)
```

### MERGE パターン（upsert）

```python
db_svc.execute_sql(
    f"""MERGE INTO {catalog}.apps.app_subscriptions AS t
        USING (SELECT ? AS app_id, ? AS user_id) AS s
          ON t.app_id = s.app_id AND t.user_id = s.user_id
        WHEN MATCHED THEN UPDATE SET status = 'ACTIVE', revoked_at = NULL
        WHEN NOT MATCHED THEN INSERT (subscription_id, app_id, user_id, status, subscribed_at)
          VALUES (uuid(), s.app_id, s.user_id, 'ACTIVE', current_timestamp())""",
    (app_id, user_id),
)
```

### UUID 生成

```python
import uuid
new_id = str(uuid.uuid4())
```

---

## モックデータの追加・変更方法

`app/services/mock_data.py` の関数を編集する。
各関数は対応する Delta Table のカラム名に一致した dict を返す必要がある。

```python
def mock_catalogs(user_id: str) -> list[dict]:
    return [
        {
            "catalog_name": "new_catalog",      # governance.catalog_definitions と一致
            "display_name": "新しいカタログ",
            "description": "説明文",
            "owner_user_id": user_id,
            "my_role": "owner",
            "my_request_status": "APPROVED",
            "requires_approval": False,
            "status": "ACTIVE",
            "mou_version": "v1",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        # ...
    ]
```

---

## テストの書き方

```bash
pytest tests/ -v                          # 全テスト
pytest tests/test_api.py::test_get_me -v  # 単一テスト
pytest tests/ -k "catalog" -v             # キーワードフィルタ
```

TestClient は `DEV_MODE=true` で動作するため、Databricks 接続は不要。

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_新機能():
    # arrange
    payload = {"key": "value"}

    # act
    res = client.post("/v1/some-endpoint", json=payload)

    # assert
    assert res.status_code == 200
    data = res.json()
    assert "expected_field" in data
    assert data["expected_field"] == "expected_value"
```

---

## 新しいエンドポイントを追加する手順

1. `app/models.py` にリクエスト/レスポンスの Pydantic モデルを追加
2. `app/services/mock_data.py` にモック関数を追加
3. `app/routers.py` に適切な router オブジェクトでエンドポイント関数を追加
   - dev/本番二分岐パターンを踏襲すること
4. `app/main.py` のルーター登録が必要なら追加
5. `tests/test_api.py` に対応するテストケースを追加
6. `frontend/src/api/index.ts` にクライアント関数を追加
7. `frontend/src/hooks/index.ts` に対応するカスタムフックを追加
8. `frontend/src/types/index.ts` に型定義を追加

---

## 既知の TODO・未実装箇所

| 箇所 | 内容 |
|---|---|
| `routers.py` の `cross_search` | Databricks Vector Search API の呼び出し実装が未完 |
| `routers.py` の `get_statistics` | PERCENTILE_CONT / STDDEV の SQL クエリが未実装 |
| `routers.py` の `get_vehicle_status` / `get_vehicle_timeseries` | 本番 SQL クエリが未実装 |
| `auth.py` の本番トークン検証 | JWKS キャッシュ（httpx → 非同期・キャッシュ化）が必要 |
| `audit.operation_log` への書き込み | 全 API 共通ミドルウェアとして FastAPI `middleware` で実装予定 |
| `routers.py` の `update_mou` | バージョン番号の採番ロジックが簡易版 |
| エラーハンドリング | `db_svc.execute_sql` の接続エラー時のリトライ・ロールバック |

---

## 環境変数一覧

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `DATABRICKS_HOST` | — | Databricks ワークスペース URL |
| `DATABRICKS_SP_CLIENT_ID` | — | サービスプリンシパル Client ID |
| `DATABRICKS_SP_CLIENT_SECRET` | — | サービスプリンシパル Client Secret |
| `DATABRICKS_SQL_WAREHOUSE_ID` | — | SQL Warehouse ID |
| `AWS_REGION` | `ap-northeast-1` | AWS リージョン |
| `AWS_SES_SENDER` | `noreply@portal.example.com` | SES 送信元メールアドレス |
| `S3_VIDEO_BUCKET` | `portal-vehicle-videos` | 車載動画 S3 バケット名 |
| `PORTAL_CATALOG` | `portal` | Delta Table のカタログ名 |
| `OIDC_JWKS_URI` | — | IAM Identity Center JWKS エンドポイント |
| `OIDC_AUDIENCE` | — | OIDC audience 値 |
| `DEV_MODE` | `true` | `true` でモックモード（Databricks/AWS 不要） |
| `DEV_USER_ID` | `dev-user-001` | dev モードの固定ユーザー ID |
| `DEV_USER_EMAIL` | `dev@example.com` | dev モードの固定メールアドレス |
| `DEV_USER_NAME` | `開発ユーザー` | dev モードの固定表示名 |
