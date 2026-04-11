from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Databricks
    databricks_host: str = "https://adb-xxxx.azuredatabricks.net"
    databricks_sp_client_id: str = ""
    databricks_sp_client_secret: str = ""
    databricks_sql_warehouse_id: str = ""

    # AWS
    aws_region: str = "ap-northeast-1"
    aws_ses_sender: str = "noreply@portal.example.com"
    s3_video_bucket: str = "portal-vehicle-videos"

    # Portal Delta catalog
    portal_catalog: str = "portal"

    # Auth
    oidc_jwks_uri: str = ""
    oidc_audience: str = ""

    # Dev mode: skip token verification
    dev_mode: bool = True
    dev_user_id: str = "dev-user-001"
    dev_user_email: str = "dev@example.com"
    dev_user_name: str = "開発ユーザー"


@lru_cache
def get_settings() -> Settings:
    return Settings()
