from __future__ import annotations
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import get_settings
from app.models import CurrentUser, CatalogRole

security = HTTPBearer(auto_error=False)


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
                CatalogRole(catalog_name="fault_diagnostics",  role="viewer"),
            ],
        )

    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="認証トークンが必要です")

    # Production token verification (IAM Identity Center JWKS)
    try:
        from jose import jwt, JWTError
        import httpx

        jwks_resp = httpx.get(settings.oidc_jwks_uri, timeout=5)
        jwks_resp.raise_for_status()
        jwks = jwks_resp.json()

        payload = jwt.decode(
            credentials.credentials,
            jwks,
            algorithms=["RS256"],
            audience=settings.oidc_audience,
        )
        return CurrentUser(
            user_id=payload.get("sub", ""),
            email=payload.get("email", ""),
            display_name=payload.get("name", payload.get("email", "")),
            is_admin=False,
            catalog_roles=[],
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理者権限が必要です")
    return user
