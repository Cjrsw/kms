from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="KMS API", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    app_debug: bool = Field(default=True, alias="APP_DEBUG")
    api_v1_prefix: str = Field(default="/api/v1", alias="API_V1_PREFIX")

    secret_key: str = Field(default="change-me", alias="SECRET_KEY")
    access_token_expire_minutes: int = Field(default=720, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    max_login_attempts: int = Field(default=5, alias="MAX_LOGIN_ATTEMPTS")
    login_lock_minutes: int = Field(default=5, alias="LOGIN_LOCK_MINUTES")
    login_lock_step_minutes: int = Field(default=5, alias="LOGIN_LOCK_STEP_MINUTES")
    demo_auth_enabled: bool = Field(default=True, alias="DEMO_AUTH_ENABLED")
    cors_allow_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="CORS_ALLOW_ORIGINS",
    )

    mysql_host: str = Field(default="mysql", alias="MYSQL_HOST")
    mysql_port: int = Field(default=3306, alias="MYSQL_PORT")
    mysql_database: str = Field(default="kms", alias="MYSQL_DATABASE")
    mysql_user: str = Field(default="kms", alias="MYSQL_USER")
    mysql_password: str = Field(default="kms", alias="MYSQL_PASSWORD")

    redis_url: str = Field(default="redis://redis:6379/0", alias="REDIS_URL")
    elasticsearch_url: str = Field(default="http://elasticsearch:9200", alias="ELASTICSEARCH_URL")
    qdrant_url: str = Field(default="http://qdrant:6333", alias="QDRANT_URL")
    qdrant_collection: str = Field(default="kms_chunks", alias="QDRANT_COLLECTION")
    qdrant_timeout_seconds: int = Field(default=15, alias="QDRANT_TIMEOUT_SECONDS")

    minio_endpoint: str = Field(default="minio:9000", alias="MINIO_ENDPOINT")
    minio_access_key: str = Field(default="minioadmin", alias="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field(default="minioadmin", alias="MINIO_SECRET_KEY")
    minio_bucket: str = Field(default="kms-files", alias="MINIO_BUCKET")
    minio_secure: bool = Field(default=False, alias="MINIO_SECURE")

    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    qa_recall_top_k: int = Field(default=8, alias="QA_RECALL_TOP_K")
    qa_source_top_n: int = Field(default=5, alias="QA_SOURCE_TOP_N")

    @property
    def sqlalchemy_database_uri(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )

    @property
    def cors_allow_origins_list(self) -> List[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_allow_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
