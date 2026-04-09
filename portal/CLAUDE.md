# データ基盤ポータル — Claude Code 指示書

## プロジェクト概要

Databricks (on AWS) を中核とした自動車データ管理ポータル。
Unity Catalog によるデータカタログ管理・MOU 申請フロー・車両データ分析を提供する。

```
portal/
├── frontend/   React 19 + Vite + TypeScript（SPA）
├── backend/    Python 3.11 + FastAPI（Lambda ハンドラ兼用）
└── CLAUDE.md   ← このファイル
```

サブディレクトリにも CLAUDE.md を置いている。
**フロントエンド作業時は `frontend/CLAUDE.md`、バックエンド作業時は `backend/CLAUDE.md` も必ず読むこと。**

---

## アーキテクチャ概要

```
ブラウザ (React)
  └─ HTTPS ─► Amazon CloudFront → S3 (静的サイト)
               ↓ API calls
            API Gateway → AWS Lambda (FastAPI/Mangum)
               ↓
            Databricks Serverless SQL Warehouse
            Unity Catalog (権限管理・メタデータ)
            Delta Lake (MOU記録・通知・申請管理)
               ↓ 認証
            AWS IAM Identity Center (OIDC/SAML SSO)
```

### 外部サービス依存関係

| サービス | 用途 | 切替方法 |
|---|---|---|
| Databricks Unity Catalog | カタログ権限管理 | `DEV_MODE=true` でモック |
| Databricks SQL Warehouse | データクエリ | 同上 |
| AWS IAM Identity Center | SSO 認証 | dev: トークン検証スキップ |
| AWS SES | メール通知 | dev: コンソール出力 |
| AWS S3 | 動画ストレージ | dev: モック URL 返却 |
| AWS Cognito | アプリ連携 | dev: スキップ |

---

## dev モードの動作

`backend/.env` の `DEV_MODE=true`（デフォルト）では：
- Databricks/AWS 接続を完全スキップ
- `app/services/mock_data.py` のモックデータを返却
- OIDC トークン検証をスキップし固定ユーザーを返す
- フロントエンドはログインボタンを押すと即座にモックトークンをセット

**本番化手順**: `.env` の `DEV_MODE=false` にして各認証情報を設定するだけ。
各ルーターの `if not settings.dev_mode:` ブロックが自動的に有効になる。

---

## 全体共通ルール

### コミットメッセージ
```
feat(catalog): MOU バージョン発行時に既存ユーザーへ再同意通知を追加
fix(analysis): 車両なし状態でのタイムシリーズクエリエラーを修正
refactor(backend): execute_sql のリトライロジックを共通化
test(api): 統計分析エンドポイントのエッジケーステストを追加
```

形式: `<type>(<scope>): <日本語の説明>`
type: `feat` / `fix` / `refactor` / `test` / `docs` / `chore`

### 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| Python 関数・変数 | snake_case | `get_catalog_detail` |
| Python クラス | PascalCase | `CreateCatalogRequest` |
| TypeScript 関数・変数 | camelCase | `getCatalogDetail` |
| TypeScript 型・コンポーネント | PascalCase | `CatalogMarketplace` |
| React カスタムフック | `use` プレフィックス | `useCatalogs` |
| Delta Table カラム | snake_case | `agreement_id` |
| API エンドポイント | kebab-case | `/access-requests` |
| Databricks グループ | `catalog-{role}-{catalog_name}` | `catalog-viewer-vehicle_timeseries` |

### 禁止事項
- フロントエンドで `localStorage` / `sessionStorage` は使用しない（Zustand + メモリのみ）
- バックエンドで PAT（Personal Access Token）を使用しない（M2M OAuth2 のみ）
- ハードコードされた認証情報をコミットしない
- Delta Table の外部キー制約に依存しない（Lambda 側のロジックで整合性を保つ）

---

## Delta Table 一覧（`portal` カタログ）

| スキーマ.テーブル | 主な用途 | 書き込み主体 |
|---|---|---|
| `governance.catalog_definitions` | カタログメタ情報 | Lambda |
| `governance.mou_definitions` | MOU バージョン管理 | Lambda |
| `governance.mou_agreements` | 閲覧申請・MOU合意記録 (Delta CDF有効) | Lambda |
| `apps.app_registry` | データアプリ登録情報 | Lambda |
| `apps.app_subscriptions` | アプリ利用状態 | Lambda |
| `notifications.inbox` | ポータル内通知 | Lambda / Databricks Job |
| `notifications.quality_alerts` | データ品質アラート | Databricks Job のみ |
| `search.search_history` | 横断検索履歴 | Lambda |
| `search.saved_views` | CREATE VIEW 保存記録 | Lambda |
| `audit.operation_log` | 操作監査ログ (Delta CDF有効) | Lambda（全 API 共通） |

---

## よく使うコマンド

```bash
# バックエンド開発
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload        # API サーバー起動
pytest tests/ -v                     # テスト実行
pytest tests/test_api.py::test_cross_search -v  # 単一テスト

# フロントエンド開発
cd frontend
npm run dev          # 開発サーバー起動 (http://localhost:5173)
npm run typecheck    # 型チェック
npm run build        # 本番ビルド
```
