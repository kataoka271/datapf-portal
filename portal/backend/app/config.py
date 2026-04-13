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

    # Vector Search
    vector_search_backend: str = "s3vectors"
    s3_vectors_bucket: str = "portal-scene-vectors"
    s3_vectors_index: str = "video-frames"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "video-frames"
    pgvector_connection_string: str = ""
    databricks_vector_search_endpoint: str = ""
    databricks_vector_search_index: str = ""

    # Embedding
    embedding_lambda_name: str = "portal-embedding"
    frame_embed_mode: str = "image_clip"
    embed_model_name: str = "openai/clip-vit-base-patch32"
    frame_embed_dim: int = 512

    # Video clip
    clip_mode: str = "browser_seek"

    # Genie Space IDs: JSON mapping of catalog_name -> space_id
    # e.g. GENIE_SPACE_IDS='{"vehicle_timeseries":"01abc...","fault_diagnostics":"02def..."}'
    genie_space_ids: str = "{}"

    @property
    def genie_space_id_map(self) -> dict[str, str]:
        import json

        return json.loads(self.genie_space_ids)

    # Dev mode: skip token verification
    dev_mode: bool = True
    dev_user_id: str = "dev-user-001"
    dev_user_email: str = "dev@example.com"
    dev_user_name: str = "開発ユーザー"


@lru_cache
def get_settings() -> Settings:
    return Settings()
