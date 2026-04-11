"""
FastAPI application entry point.
- uvicorn app.main:app --reload   →  local development server
- Lambda handler via Mangum       →  AWS Lambda
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import (
    router_admin,
    router_alerts,
    router_analysis,
    router_apps,
    router_auth,
    router_catalogs,
    router_notifications,
    router_search,
)

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="データ基盤ポータル API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = "/v1"
app.include_router(router_auth, prefix=PREFIX)
app.include_router(router_notifications, prefix=PREFIX)
app.include_router(router_catalogs, prefix=PREFIX)
app.include_router(router_search, prefix=PREFIX)
app.include_router(router_apps, prefix=PREFIX)
app.include_router(router_analysis, prefix=PREFIX)
app.include_router(router_alerts, prefix=PREFIX)
app.include_router(router_admin, prefix=PREFIX)


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Lambda handler ────────────────────────────────────────────────────────────
try:
    from mangum import Mangum

    handler = Mangum(app, lifespan="off")
except ImportError:
    handler = None  # not running in Lambda
