# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
datapf-portal/
├── portal/
│   ├── frontend/       React 19 + Vite + TypeScript SPA
│   ├── backend/        Python 3.11 + FastAPI (runs as uvicorn locally, Lambda in prod via Mangum)
│   ├── infra/          Terraform modules + per-environment configs (dev / prod)
│   ├── Makefile        All build/deploy commands — run from portal/
│   └── docker-compose.yml
└── spec/               Product specification documents (SPEC.md + .docx files)
```

Each subdirectory has its own CLAUDE.md with detailed guidance:
- `portal/CLAUDE.md` — architecture overview, Delta Table schema, naming conventions, forbidden patterns
- `portal/frontend/CLAUDE.md` — component structure, TanStack Query key system, state management rules
- `portal/backend/CLAUDE.md` — endpoint list, dev/prod branching pattern, Databricks service layer
- `portal/infra/CLAUDE.md` — Terraform module rules, environment differences, deployment workflow

## Local Development

All commands below are run from `portal/`.

### Docker (recommended — no local runtime needed)
```bash
docker compose up --build   # frontend :5173, backend :8000
```
Source directories are mounted for live reload (`src/` and `app/`).

### Manual

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # DEV_MODE=true by default
uvicorn app.main:app --reload   # http://localhost:8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173  (proxies /v1 → localhost:8000)
```

### Key dev commands (from `portal/`)
```bash
make test                   # backend pytest
make build-lambda           # zip app/ → backend/lambda.zip
make build-frontend         # tsc + vite build → frontend/dist/
make plan ENV=dev           # terraform plan
make apply ENV=dev          # terraform apply
make lambda-update ENV=dev  # update Lambda code only (fast, no Terraform)
make frontend-deploy ENV=dev # build + S3 sync + CloudFront invalidation
```

**Use `uv` command to execute tools within virtual environment**
```bash
uv run python  # execute python script
uv run pytest -v  # pytest
uv run ruff check -I --fix  # ruff check, organize imports
uv run ruff format  # format python
```

**Frontend checks (from `portal/frontend/`)**
```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src
npm run format      # prettier src
```

**Backend tests (from `portal/backend/`)**
```bash
pytest tests/ -v
pytest tests/test_api.py::test_get_me -v   # single test
pytest tests/ -k "catalog" -v              # keyword filter
```

## Architecture: How the Pieces Connect

### Request flow (dev)
```
Browser → Vite dev server (:5173)
  /v1/* proxied → uvicorn (:8000)
    FastAPI router → mock_data.py (DEV_MODE=true)
```

### Request flow (prod)
```
Browser → CloudFront → S3 (React SPA static files)
  API calls → API Gateway (JWT authorizer validates IAM Identity Center OIDC token)
    → Lambda (same FastAPI app wrapped by Mangum)
      → Databricks SQL Warehouse / Unity Catalog / AWS SES / S3
```

### DEV_MODE toggle
`backend/.env` sets `DEV_MODE=true` (default). This single flag controls:
- All Databricks/AWS calls are skipped → `app/services/mock_data.py` returns fixtures
- OIDC token validation is skipped → fixed dev user (`dev-user-001`) is injected
- Frontend login button sets a mock token immediately

To test production code paths: set `DEV_MODE=false` and provide real credentials in `.env`.

### Per-catalog roles
A user's role (owner / editor / viewer / general) is **catalog-scoped**, not global. `CurrentUser.catalog_roles` is a list of `(catalog_name, role)` pairs. Authorization checks in `routers.py` filter this list per request; there is no global role field.

### Terraform module → environment pattern
Reusable modules live in `infra/terraform/modules/`. Environments (`dev/`, `prod/`) call these modules with different variables — no logic lives in environment files. The key differences are `DEV_MODE`, Lambda memory, WAF, DLQ, log retention, and deletion protection. See `portal/infra/CLAUDE.md` for the full diff table.

### Frontend API → backend contract
`frontend/src/api/index.ts` is the single source of truth for API calls. All 31 endpoints are implemented there. Backend endpoint list is in `portal/backend/CLAUDE.md`. When adding an endpoint, update both files plus `src/hooks/index.ts` (TanStack Query hook) and `src/types/index.ts`.
