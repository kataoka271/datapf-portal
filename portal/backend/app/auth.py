from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from backend.app.config import get_settings
from backend.app.models import CatalogRole, CurrentUser


async def get_current_user(request: Request) -> CurrentUser:
    """
    Databricks Apps: extract user identity from OBO token in x-forwarded-access-token header.
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

    obo_token = request.headers.get("x-forwarded-access-token")
    if not obo_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="認証トークンが必要です")

    # Production: resolve user identity via Databricks OBO token
    try:
        from databricks.sdk import WorkspaceClient

        from app.services import databricks as db_svc

        w = WorkspaceClient(token=obo_token)
        user_info = w.current_user.me()
        email = user_info.emails[0].value if user_info.emails else ""
        is_admin = any(getattr(g, "display", "") == "admins" for g in (user_info.groups or []))
        catalog_roles = [CatalogRole(**r) for r in db_svc.get_user_catalog_roles(email)]
        return CurrentUser(
            user_id=str(user_info.id or ""),
            email=email,
            display_name=user_info.display_name or email,
            is_admin=is_admin,
            catalog_roles=catalog_roles,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理者権限が必要です")
    return user
