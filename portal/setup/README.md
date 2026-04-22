# datapf-portal — インフラセットアップバンドル

ポータルを `DEV_MODE=false` で動作させるために必要な Unity Catalog およびワークスペースリソースを一括プロビジョニングする Databricks Asset Bundle です。初回のみ実行します。

## 前提条件

| 要件 | 確認コマンド |
|---|---|
| Databricks CLI ≥ v0.292.0 | `databricks --version` |
| 認証済みプロファイル | `databricks auth profiles` |
| アカウント管理者権限（メタストア権限付与に必要） | Databricks アカウントコンソール |

## 作成されるリソース

### Unity Catalog

| リソース | 種別 | 備考 |
|---|---|---|
| `portal` カタログ | Catalog | `portal_catalog` 変数で名前を変更可能 |
| `portal.governance` | Schema | |
| `portal.apps` | Schema | |
| `portal.notifications` | Schema | |
| `portal.search` | Schema | |
| `portal.audit` | Schema | |

### Delta テーブル

| テーブル | Delta CDF | 用途 |
|---|---|---|
| `governance.catalog_definitions` | — | 登録済みデータカタログのメタ情報 |
| `governance.mou_definitions` | — | カタログごとの MOU バージョン管理 |
| `governance.mou_agreements` | ✓ | アクセス申請・MOU 合意記録 |
| `apps.app_registry` | — | データアプリ登録情報 |
| `apps.app_subscriptions` | — | ユーザーのアプリ利用状態 |
| `notifications.inbox` | — | ユーザーごとのポータル内通知 |
| `notifications.quality_alerts` | — | データ品質アラート（監視 Job が書き込む） |
| `search.search_history` | — | 横断検索履歴 |
| `search.saved_views` | — | 保存済み横断ビュー |
| `audit.operation_log` | ✓ | API 操作監査ログ |

### 権限設定

- サービスプリンシパルに `portal` カタログの `ALL_PRIVILEGES` を付与
- サービスプリンシパルにメタストアの `CREATE_CATALOG` を付与（ポータル経由でデータカタログを新規登録するために必要）
- サービスプリンシパルに SQL Warehouse の `CAN_USE` を付与
- ワークスペースグループを作成: `catalog-owner-portal`、`catalog-editor-portal`、`catalog-viewer-portal`

## 実行手順

```bash
cd portal/setup

# 1. ジョブ定義をワークスペースにデプロイ
databricks bundle deploy -t dev --profile DEFAULT

# 2. セットアップジョブを実行（初回のみ）
databricks bundle run setup -t dev --profile DEFAULT \
  --param warehouse_id=<DATABRICKS_SQL_WAREHOUSE_ID> \
  --param sp_app_id=<DATABRICKS_SP_CLIENT_ID>
```

すべてのタスクは `CREATE TABLE IF NOT EXISTS` および冪等な SDK 呼び出しを使用しているため、再実行しても安全です。

### 変数一覧

| 変数 | デフォルト | 説明 |
|---|---|---|
| `portal_catalog` | `portal` | ポータルテーブルを格納する Unity Catalog 名 |
| `warehouse_id` | _（空）_ | SQL Warehouse ID（`.env` の `DATABRICKS_SQL_WAREHOUSE_ID`） |
| `sp_app_id` | _（空）_ | サービスプリンシパルのクライアント ID（`.env` の `DATABRICKS_SP_CLIENT_ID`） |

実行時は `--param key=value`、デプロイ時は `--var key=value` で上書きできます。

## ジョブタスク構成

```
create_catalog_and_schemas
  └── create_tables
        └── grant_permissions
```

| タスク | ソース | 内容 |
|---|---|---|
| `create_catalog_and_schemas` | `src/01_create_catalog.py` | portal カタログと 5 スキーマを作成 |
| `create_tables` | `src/02_create_tables.py` | 10 個の Delta テーブルを作成 |
| `grant_permissions` | `src/03_grant_permissions.py` | SP への権限付与・portal ワークスペースグループの作成 |

## カタログごとのグループ（実行時）

ユーザーがポータル経由で新しいデータカタログを登録すると、`backend/src/backend/app/services/databricks.py` の `create_unity_catalog()` が以下のグループを自動作成します。

```
catalog-owner-{catalog_name}
```

ただし、`grant_catalog_viewer` / `grant_catalog_editor` でメンバーを追加するには **viewer・editor グループも事前に存在している必要があります**。現在のコードではこれらは自動作成されないため、新しいカタログをオンボーディングする際に手動で作成するか、`create_unity_catalog()` を拡張してください。

```bash
databricks groups create --display-name catalog-viewer-{catalog_name} --profile DEFAULT
databricks groups create --display-name catalog-editor-{catalog_name} --profile DEFAULT
```

## セットアップ後の設定

`portal/backend/.env`（または Databricks Apps の環境変数）に以下を設定してください。

```env
DEV_MODE=false
DATABRICKS_HOST=https://dbc-90259411-7f3f.cloud.databricks.com
DATABRICKS_SP_CLIENT_ID=<上記で使用した sp_app_id>
DATABRICKS_SP_CLIENT_SECRET=<クライアントシークレット>
DATABRICKS_SQL_WAREHOUSE_ID=<上記で使用した warehouse_id>
OIDC_JWKS_URI=<IAM Identity Center の JWKS エンドポイント>
OIDC_AUDIENCE=<OIDC audience 値>
```
