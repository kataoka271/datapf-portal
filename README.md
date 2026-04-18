# データ基盤ポータルサイト

Databricks × AWS を基盤とした自動車データ管理ポータル。

## 構成

```
portal/
├── frontend/   React 19 + Vite + TypeScript
└── backend/    Python 3.11 + FastAPI (Lambda ハンドラ兼開発サーバー)
```

## クイックスタート

### フロントエンド
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build
npm run typecheck
```

### バックエンド
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # http://localhost:8000
```

環境変数は `.env.example` をコピーして `.env` を作成してください。

## 環境変数

### フロントエンド (`frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:8000/v1
VITE_OIDC_AUTHORITY=https://identitycenter.amazonaws.com/...
VITE_OIDC_CLIENT_ID=...
VITE_OIDC_REDIRECT_URI=http://localhost:5173/callback
```

### バックエンド (`backend/.env`)
```
DATABRICKS_HOST=https://<workspace>.azuredatabricks.net
DATABRICKS_SP_CLIENT_ID=...
DATABRICKS_SP_CLIENT_SECRET=...
DATABRICKS_SP_TENANT_ID=...
DATABRICKS_SQL_WAREHOUSE_ID=...
AWS_REGION=ap-northeast-1
AWS_SES_SENDER=noreply@portal.example.com
S3_VIDEO_BUCKET=portal-vehicle-videos
PORTAL_CATALOG=portal
```
