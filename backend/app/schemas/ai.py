from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


ModelCapability = Literal["chat", "embedding"]
ModelProvider = Literal["openai_compatible"]


class AdminAIModelItem(BaseModel):
    id: int
    name: str
    provider: ModelProvider
    capability: ModelCapability
    api_base_url: str
    model_name: str
    api_key_masked: str
    extra_headers: dict[str, str]
    extra_body: dict[str, Any]
    max_tokens: int | None
    timeout_seconds: int
    description: str
    is_enabled: bool
    created_at: str
    updated_at: str


class AdminAIModelCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    provider: ModelProvider = "openai_compatible"
    capability: ModelCapability
    api_base_url: HttpUrl
    model_name: str = Field(min_length=1, max_length=120)
    api_key: str = Field(min_length=1, max_length=4096)
    extra_headers: dict[str, str] = Field(default_factory=dict)
    extra_body: dict[str, Any] = Field(default_factory=dict)
    max_tokens: int | None = Field(default=None, ge=1, le=200000)
    timeout_seconds: int = Field(default=30, ge=5, le=180)
    description: str = Field(default="", max_length=500)
    is_enabled: bool = True


class AdminAIModelUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    provider: ModelProvider = "openai_compatible"
    capability: ModelCapability
    api_base_url: HttpUrl
    model_name: str = Field(min_length=1, max_length=120)
    api_key: str | None = Field(default=None, min_length=1, max_length=4096)
    extra_headers: dict[str, str] = Field(default_factory=dict)
    extra_body: dict[str, Any] = Field(default_factory=dict)
    max_tokens: int | None = Field(default=None, ge=1, le=200000)
    timeout_seconds: int = Field(default=30, ge=5, le=180)
    description: str = Field(default="", max_length=500)
    is_enabled: bool = True


class AdminAIModelDefaults(BaseModel):
    chat_default_model_id: int | None = None
    embedding_default_model_id: int | None = None


class AdminAIModelDefaultsUpdateRequest(BaseModel):
    chat_default_model_id: int | None = None
    embedding_default_model_id: int | None = None


class AdminAIModelsResponse(BaseModel):
    total: int
    defaults: AdminAIModelDefaults
    models: list[AdminAIModelItem]


class QaModelOption(BaseModel):
    id: int
    name: str
    model_name: str
    provider: ModelProvider


class QaAvailableModelsResponse(BaseModel):
    models: list[QaModelOption]
    user_default_model_id: int | None = None
    system_default_model_id: int | None = None


class UserModelPreferenceResponse(BaseModel):
    chat_model_id: int | None = None
    system_default_chat_model_id: int | None = None


class UserModelPreferenceUpdateRequest(BaseModel):
    chat_model_id: int | None = None


class QaAuditLogItem(BaseModel):
    id: int
    username: str
    question: str
    repository_slug: str
    model_name: str
    status: str
    error_code: str
    error_category: str
    hint: str
    trace_id: str
    latency_ms: int
    source_count: int
    recall_mode: str
    created_at: str


class QaAuditLogResponse(BaseModel):
    total: int
    logs: list[QaAuditLogItem]


class AdminQASystemPromptResponse(BaseModel):
    system_prompt: str
    updated_at: str | None = None


class AdminQASystemPromptUpdateRequest(BaseModel):
    system_prompt: str = Field(min_length=1, max_length=20000)
