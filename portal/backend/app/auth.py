from __future__ import annotations

import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.config import get_settings
from backend.app.models import CatalogRole, CurrentUser

security = HTTPBearer(auto_error=False)

# JWKS cache — avoids an HTTP round-trip on every request
_jwks_cache: dict = {"data": None, "fetched_at": 0.0}
_JWKS_TTL = 300  # 5 minutes


def _get_jwks(jwks_uri: str) -> dict:
    now = time.monotonic()
    if _jwks_cache["data"] is None or now - _jwks_cache["fetched_at"] > _JWKS_TTL:
        import httpx

        resp = httpx.get(jwks_uri, timeout=5)
        resp.raise_for_status()
        _jwks_cache["data"] = resp.json()
        _jwks_cache["fetched_at"] = now
    return _jwks_cache["data"]


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> CurrentUser:
    """
    Production: verify OIDC JWT from IAM Identity Center.
    Dev mode (DEV_MODE=true): return a mock user without verification.
    """
    settings = get_settings()

    if settings.dev_mode:
        return CurrentUser(
            user_id=settings.dev_user_id,
            email=settings.dev_user_email,
            display_name=settings.dev_user_name,
            is_admin=True,
            catalog_roles=[
                CatalogRole(catalog_name="vehicle_timeseries", role="owner"),
                CatalogRole(catalog_name="fault_diagnostics", role="viewer"),
            ],
        )

    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="認証トークンが必要です")

    # Production token verification (IAM Identity Center JWKS)
    try:
        from jose import jwt

        from app.services import databricks as db_svc

        jwks = _get_jwks(settings.oidc_jwks_uri)
        payload = jwt.decode(
            credentials.credentials,
            jwks,
            algorithms=["RS256"],
            audience=settings.oidc_audience,
        )
        email = payload.get("email", "")
        catalog_roles = [CatalogRole(**r) for r in db_svc.get_user_catalog_roles(email)]
        return CurrentUser(
            user_id=payload.get("sub", ""),
            email=email,
            display_name=payload.get("name", email),
            is_admin=False,
            catalog_roles=catalog_roles,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理者権限が必要です")
    return user
