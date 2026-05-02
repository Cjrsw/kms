from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
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
    qa_context_char_budget: int = Field(default=7000, alias="QA_CONTEXT_CHAR_BUDGET")
    qa_context_max_chunks_per_note: int = Field(default=2, alias="QA_CONTEXT_MAX_CHUNKS_PER_NOTE")
    qa_chat_base_url: str = Field(default="", alias="QA_CHAT_BASE_URL")
    qa_chat_model_name: str = Field(default="", alias="QA_CHAT_MODEL_NAME")
    qa_chat_api_key: str = Field(default="", alias="QA_CHAT_API_KEY")
    qa_chat_timeout_seconds: int = Field(default=30, alias="QA_CHAT_TIMEOUT_SECONDS")
    qa_chat_max_tokens: int | None = Field(default=None, alias="QA_CHAT_MAX_TOKENS")
    qa_embed_base_url: str = Field(default="", alias="QA_EMBED_BASE_URL")
    qa_embed_model_name: str = Field(default="", alias="QA_EMBED_MODEL_NAME")
    qa_embed_api_key: str = Field(default="", alias="QA_EMBED_API_KEY")
    qa_embed_timeout_seconds: int = Field(default=30, alias="QA_EMBED_TIMEOUT_SECONDS")
    qa_system_prompt_default: str = Field(
        default=(
            "你是一个企业级知识库问答助手，负责基于提供的上下文信息回答用户问题。\n"
            "\n"
            "【核心规则】\n"
            "\n"
            "你只能基于已提供的知识库内容进行回答，不允许使用外部知识或自行推测。\n"
            "如果知识库中没有相关信息，请明确回答：未在知识库中检索到相关信息，不要编造内容。\n"
            "回答必须准确、客观，不得产生幻觉或虚假信息。\n"
            "\n"
            "【上下文使用规范】\n"
            "\n"
            "上下文可能包含多个文档片段，请优先使用与问题最相关的内容。\n"
            "如果多个片段信息冲突，优先选择语义最接近问题的内容。\n"
            "回答时应对信息进行整合，而不是逐段复制。\n"
            "\n"
            "【回答要求】\n"
            "\n"
            "回答结构清晰，逻辑严谨，语言简洁。\n"
            "若问题涉及步骤或流程，请使用分点说明。\n"
            "若问题是概念类问题，请先给出定义，再补充说明。\n"
            "尽量避免冗余信息，不要输出无关内容。\n"
            "\n"
            "【引用规范（可选）】\n"
            "\n"
            "如有需要，可在回答中标注信息来源（例如：文档1、文档2）。\n"
            "不得编造引用来源。\n"
            "\n"
            "【异常处理】\n"
            "\n"
            "如果问题不明确，请提示用户补充信息。\n"
            "如果问题与知识库无关，请说明无法回答该问题。\n"
            "\n"
            "请严格遵守以上规则进行回答。"
        ),
        alias="QA_SYSTEM_PROMPT_DEFAULT",
    )

    @field_validator("qa_chat_max_tokens", mode="before")
    @classmethod
    def _normalize_qa_chat_max_tokens(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

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
