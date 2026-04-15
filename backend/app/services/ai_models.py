from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.ai import AIModel, UserModelPreference
from app.models.user import User
from app.schemas.ai import (
    AdminAIModelCreateRequest,
    AdminAIModelDefaults,
    AdminAIModelUpdateRequest,
    QaModelOption,
    UserModelPreferenceResponse,
)
from app.services.secret_crypto import decrypt_secret, encrypt_secret, mask_secret
from app.services.system_settings import get_ai_default_model_ids, set_ai_default_model_ids


AIModelCapability = Literal["chat", "embedding"]


@dataclass
class StructuredFailure:
    error_code: str
    error_category: str
    user_message: str
    hint: str


class ModelInvocationError(RuntimeError):
    def __init__(self, failure: StructuredFailure):
        super().__init__(failure.user_message)
        self.failure = failure


def serialize_admin_model(model: AIModel) -> dict[str, Any]:
    return {
        "id": model.id,
        "name": model.name,
        "provider": model.provider,
        "capability": model.capability,
        "api_base_url": model.api_base_url,
        "model_name": model.model_name,
        "api_key_masked": model.api_key_masked,
        "extra_headers": _safe_json_obj(model.extra_headers_json),
        "extra_body": _safe_json_obj(model.extra_body_json),
        "max_tokens": model.max_tokens,
        "timeout_seconds": model.timeout_seconds,
        "description": model.description or "",
        "is_enabled": model.is_enabled,
        "created_at": model.created_at.isoformat(),
        "updated_at": model.updated_at.isoformat(),
    }


def create_ai_model(db: Session, payload: AdminAIModelCreateRequest) -> AIModel:
    normalized_name = payload.name.strip()
    if db.query(AIModel).filter(AIModel.name == normalized_name).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Model name already exists.")

    model = AIModel(
        name=normalized_name,
        provider=payload.provider,
        capability=payload.capability,
        api_base_url=str(payload.api_base_url).rstrip("/"),
        model_name=payload.model_name.strip(),
        api_key_encrypted=encrypt_secret(payload.api_key),
        api_key_masked=mask_secret(payload.api_key),
        extra_headers_json=json.dumps(payload.extra_headers, ensure_ascii=False),
        extra_body_json=json.dumps(payload.extra_body, ensure_ascii=False),
        max_tokens=payload.max_tokens,
        timeout_seconds=payload.timeout_seconds,
        description=payload.description.strip(),
        is_enabled=payload.is_enabled,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def update_ai_model(db: Session, model_id: int, payload: AdminAIModelUpdateRequest) -> AIModel:
    model = db.query(AIModel).filter(AIModel.id == model_id).first()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found.")

    normalized_name = payload.name.strip()
    duplicate = db.query(AIModel).filter(AIModel.name == normalized_name, AIModel.id != model_id).first()
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Model name already exists.")

    model.name = normalized_name
    model.provider = payload.provider
    model.capability = payload.capability
    model.api_base_url = str(payload.api_base_url).rstrip("/")
    model.model_name = payload.model_name.strip()
    if payload.api_key and payload.api_key.strip():
        model.api_key_encrypted = encrypt_secret(payload.api_key.strip())
        model.api_key_masked = mask_secret(payload.api_key.strip())
    model.extra_headers_json = json.dumps(payload.extra_headers, ensure_ascii=False)
    model.extra_body_json = json.dumps(payload.extra_body, ensure_ascii=False)
    model.max_tokens = payload.max_tokens
    model.timeout_seconds = payload.timeout_seconds
    model.description = payload.description.strip()
    model.is_enabled = payload.is_enabled
    model.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def set_model_enabled(db: Session, model_id: int, *, enabled: bool) -> AIModel:
    model = db.query(AIModel).filter(AIModel.id == model_id).first()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found.")
    model.is_enabled = enabled
    model.updated_at = datetime.now(UTC).replace(tzinfo=None)
    if not enabled:
        db.query(UserModelPreference).filter(UserModelPreference.chat_model_id == model.id).update(
            {UserModelPreference.chat_model_id: None},
            synchronize_session=False,
        )
        chat_default_id, embedding_default_id = get_ai_default_model_ids(db)
        if model.capability == "chat" and chat_default_id == model.id:
            chat_default_id = None
        if model.capability == "embedding" and embedding_default_id == model.id:
            embedding_default_id = None
        set_ai_default_model_ids(
            db,
            chat_default_model_id=chat_default_id,
            embedding_default_model_id=embedding_default_id,
        )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def delete_ai_model(db: Session, model_id: int) -> None:
    model = db.query(AIModel).filter(AIModel.id == model_id).first()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found.")

    db.query(UserModelPreference).filter(UserModelPreference.chat_model_id == model.id).update(
        {UserModelPreference.chat_model_id: None},
        synchronize_session=False,
    )
    chat_default_id, embedding_default_id = get_ai_default_model_ids(db)
    if chat_default_id == model.id:
        chat_default_id = None
    if embedding_default_id == model.id:
        embedding_default_id = None
    set_ai_default_model_ids(
        db,
        chat_default_model_id=chat_default_id,
        embedding_default_model_id=embedding_default_id,
    )

    db.delete(model)
    db.commit()


def get_admin_model_defaults(db: Session) -> AdminAIModelDefaults:
    chat_default_id, embedding_default_id = get_ai_default_model_ids(db)
    return AdminAIModelDefaults(
        chat_default_model_id=chat_default_id,
        embedding_default_model_id=embedding_default_id,
    )


def update_admin_model_defaults(
    db: Session,
    *,
    chat_default_model_id: int | None,
    embedding_default_model_id: int | None,
) -> AdminAIModelDefaults:
    if chat_default_model_id is not None:
        chat_model = db.query(AIModel).filter(AIModel.id == chat_default_model_id).first()
        if chat_model is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat default model not found.")
        if chat_model.capability != "chat":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default chat model capability mismatch.")
        if not chat_model.is_enabled:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default chat model must be enabled.")

    if embedding_default_model_id is not None:
        embedding_model = db.query(AIModel).filter(AIModel.id == embedding_default_model_id).first()
        if embedding_model is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Embedding default model not found.")
        if embedding_model.capability != "embedding":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Default embedding model capability mismatch.",
            )
        if not embedding_model.is_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Default embedding model must be enabled.",
            )

    chat_id, embedding_id = set_ai_default_model_ids(
        db,
        chat_default_model_id=chat_default_model_id,
        embedding_default_model_id=embedding_default_model_id,
    )
    return AdminAIModelDefaults(chat_default_model_id=chat_id, embedding_default_model_id=embedding_id)


def get_enabled_chat_model_options(db: Session) -> list[QaModelOption]:
    models = (
        db.query(AIModel)
        .filter(AIModel.capability == "chat", AIModel.is_enabled.is_(True))
        .order_by(AIModel.id.asc())
        .all()
    )
    return [
        QaModelOption(
            id=model.id,
            name=model.name,
            model_name=model.model_name,
            provider="openai_compatible",
        )
        for model in models
    ]


def get_user_model_preference(db: Session, user: User) -> UserModelPreferenceResponse:
    preference = db.query(UserModelPreference).filter(UserModelPreference.user_id == user.id).first()
    if preference and preference.chat_model_id:
        selected = db.query(AIModel).filter(AIModel.id == preference.chat_model_id).first()
        if selected is None or selected.capability != "chat" or not selected.is_enabled:
            preference.chat_model_id = None
            db.add(preference)
            db.commit()

    chat_default_model_id, _ = get_ai_default_model_ids(db)
    return UserModelPreferenceResponse(
        chat_model_id=preference.chat_model_id if preference else None,
        system_default_chat_model_id=chat_default_model_id,
    )


def set_user_model_preference(db: Session, user: User, chat_model_id: int | None) -> UserModelPreferenceResponse:
    if chat_model_id is not None:
        selected = db.query(AIModel).filter(AIModel.id == chat_model_id).first()
        if selected is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected model not found.")
        if selected.capability != "chat":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected model is not a chat model.")
        if not selected.is_enabled:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected model is disabled.")

    preference = db.query(UserModelPreference).filter(UserModelPreference.user_id == user.id).first()
    if preference is None:
        preference = UserModelPreference(user_id=user.id, chat_model_id=chat_model_id)
    else:
        preference.chat_model_id = chat_model_id
    db.add(preference)
    db.commit()
    return get_user_model_preference(db, user)


def resolve_chat_model(db: Session, user: User, explicit_model_id: int | None = None) -> AIModel:
    if explicit_model_id is not None:
        model = db.query(AIModel).filter(AIModel.id == explicit_model_id).first()
        if model is None:
            raise ModelInvocationError(
                StructuredFailure(
                    error_code="model_not_found",
                    error_category="configuration",
                    user_message="所选模型不存在。",
                    hint="请在问答页重新选择模型，或联系管理员检查模型列表。",
                )
            )
        if model.capability != "chat":
            raise ModelInvocationError(
                StructuredFailure(
                    error_code="model_capability_mismatch",
                    error_category="configuration",
                    user_message="所选模型不支持聊天问答。",
                    hint="请选择聊天模型（chat）。",
                )
            )
        if not model.is_enabled:
            raise ModelInvocationError(
                StructuredFailure(
                    error_code="model_disabled",
                    error_category="configuration",
                    user_message="所选模型已被管理员禁用。",
                    hint="请切换到可用模型，或联系管理员启用该模型。",
                )
            )
        return model

    preference = db.query(UserModelPreference).filter(UserModelPreference.user_id == user.id).first()
    preferred_model_id = preference.chat_model_id if preference else None
    candidate_ids: list[int] = []
    if preferred_model_id:
        candidate_ids.append(preferred_model_id)
    chat_default_id, _ = get_ai_default_model_ids(db)
    if chat_default_id and chat_default_id not in candidate_ids:
        candidate_ids.append(chat_default_id)

    for model_id in candidate_ids:
        model = db.query(AIModel).filter(AIModel.id == model_id).first()
        if model and model.capability == "chat" and model.is_enabled:
            return model

    raise ModelInvocationError(
        StructuredFailure(
            error_code="chat_model_not_configured",
            error_category="configuration",
            user_message="当前未配置可用的聊天模型。",
            hint="请管理员在后台注册并启用至少一个 chat 模型，并设置系统默认模型。",
        )
    )


def resolve_embedding_model(db: Session) -> AIModel | None:
    _, embedding_default_id = get_ai_default_model_ids(db)
    if embedding_default_id is None:
        return None
    model = db.query(AIModel).filter(AIModel.id == embedding_default_id).first()
    if model is None or not model.is_enabled or model.capability != "embedding":
        return None
    return model


def invoke_chat_completion(
    model: AIModel,
    *,
    question: str,
    context_sections: list[str],
    trace_id: str,
) -> str:
    api_key = _decrypt_model_secret(model)
    if not api_key:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="api_key_missing",
                error_category="configuration",
                user_message="模型密钥未配置，无法调用问答模型。",
                hint="请管理员在模型配置中填写有效 API Key。",
            )
        )

    system_prompt = (
        "你是企业知识库问答助手。你只能基于给定来源作答，禁止编造。"
        " 若来源不足，请明确回答“根据当前可见内容无法回答”。"
        " 回答结尾请用 [1][2] 形式引用来源编号。"
    )
    source_block = "\n\n".join(context_sections)
    user_prompt = f"用户问题：{question}\n\n可用来源：\n{source_block}"

    payload: dict[str, Any] = {
        "model": model.model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
    }
    if model.max_tokens is not None:
        payload["max_tokens"] = model.max_tokens
    payload.update(_safe_json_obj(model.extra_body_json))

    endpoint = _resolve_endpoint(model.api_base_url, "chat/completions")
    headers = _build_headers(model, api_key)
    try:
        with httpx.Client(timeout=model.timeout_seconds) as client:
            response = client.post(endpoint, headers=headers, json=payload)
        if response.status_code >= 400:
            raise ModelInvocationError(_map_http_error_to_failure(response))
        body = response.json()
        choices = body.get("choices") or []
        for choice in choices:
            message = choice.get("message") or {}
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
        raise ModelInvocationError(
            StructuredFailure(
                error_code="empty_model_response",
                error_category="upstream",
                user_message="模型未返回有效回答。",
                hint="请检查模型服务是否支持 chat/completions 响应格式。",
            )
        )
    except httpx.ConnectError as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="network_unreachable",
                error_category="network",
                user_message="模型服务网络不可达。",
                hint=f"trace_id={trace_id}；请检查 API URL、容器网络或代理配置。",
            )
        ) from exc
    except httpx.TimeoutException as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="model_timeout",
                error_category="timeout",
                user_message="模型调用超时。",
                hint=f"trace_id={trace_id}；可提高 timeout_seconds 或检查模型服务负载。",
            )
        ) from exc
    except json.JSONDecodeError as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="invalid_model_response",
                error_category="upstream",
                user_message="模型返回格式不可解析。",
                hint=f"trace_id={trace_id}；请确认服务为 OpenAI 兼容 chat/completions 接口。",
            )
        ) from exc


def invoke_embedding(model: AIModel, *, text: str, trace_id: str) -> list[float]:
    api_key = _decrypt_model_secret(model)
    if not api_key:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="embedding_key_missing",
                error_category="configuration",
                user_message="Embedding 模型密钥未配置。",
                hint="请管理员在 embedding 模型配置中填写 API Key。",
            )
        )

    payload: dict[str, Any] = {
        "model": model.model_name,
        "input": text,
    }
    payload.update(_safe_json_obj(model.extra_body_json))
    endpoint = _resolve_endpoint(model.api_base_url, "embeddings")
    headers = _build_headers(model, api_key)
    try:
        with httpx.Client(timeout=model.timeout_seconds) as client:
            response = client.post(endpoint, headers=headers, json=payload)
        if response.status_code >= 400:
            raise ModelInvocationError(_map_http_error_to_failure(response))
        data = response.json().get("data") or []
        if not data:
            raise ModelInvocationError(
                StructuredFailure(
                    error_code="embedding_empty",
                    error_category="upstream",
                    user_message="Embedding 模型没有返回向量。",
                    hint=f"trace_id={trace_id}；请检查 embedding 模型与接口参数。",
                )
            )
        vector = data[0].get("embedding")
        if not isinstance(vector, list) or not vector:
            raise ModelInvocationError(
                StructuredFailure(
                    error_code="embedding_invalid",
                    error_category="upstream",
                    user_message="Embedding 返回格式无效。",
                    hint=f"trace_id={trace_id}；请确认接口兼容 OpenAI embeddings。",
                )
            )
        return [float(v) for v in vector]
    except httpx.ConnectError as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="embedding_network_unreachable",
                error_category="network",
                user_message="Embedding 模型网络不可达。",
                hint=f"trace_id={trace_id}；请检查 embedding API URL 连通性。",
            )
        ) from exc
    except httpx.TimeoutException as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="embedding_timeout",
                error_category="timeout",
                user_message="Embedding 模型调用超时。",
                hint=f"trace_id={trace_id}；可提高 timeout_seconds 或检查服务负载。",
            )
        ) from exc


def _build_headers(model: AIModel, api_key: str) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    for key, value in _safe_json_obj(model.extra_headers_json).items():
        if not key:
            continue
        headers[str(key)] = str(value)
    return headers


def _resolve_endpoint(base_url: str, relative_path: str) -> str:
    normalized_base = base_url.rstrip("/")
    if normalized_base.endswith(f"/{relative_path}"):
        return normalized_base
    last_segment = normalized_base.rsplit("/", 1)[-1].lower()
    if last_segment.startswith("v") and last_segment[1:].isdigit():
        return f"{normalized_base}/{relative_path}"
    return f"{normalized_base}/v1/{relative_path}"


def _decrypt_model_secret(model: AIModel) -> str:
    try:
        return decrypt_secret(model.api_key_encrypted)
    except ValueError:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="api_key_decrypt_failed",
                error_category="configuration",
                user_message="模型密钥解密失败。",
                hint="请管理员重新填写模型 API Key。",
            )
        ) from None


def _safe_json_obj(raw_json: str | None) -> dict[str, Any]:
    if not raw_json:
        return {}
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError:
        return {}
    if isinstance(parsed, dict):
        return parsed
    return {}


def _map_http_error_to_failure(response: httpx.Response) -> StructuredFailure:
    status_code = response.status_code
    body_preview = response.text[:220]
    if status_code in {401, 403}:
        return StructuredFailure(
            error_code="model_auth_failed",
            error_category="authentication",
            user_message="模型鉴权失败。",
            hint=f"请检查 API Key 权限与 Header 配置。status={status_code}; body={body_preview}",
        )
    if status_code == 429:
        return StructuredFailure(
            error_code="model_rate_limited",
            error_category="rate_limit",
            user_message="模型触发限流，请稍后重试。",
            hint="可降低并发或提高服务配额，必要时切换备用模型。",
        )
    if status_code >= 500:
        return StructuredFailure(
            error_code="model_upstream_error",
            error_category="upstream",
            user_message="模型服务当前不可用。",
            hint=f"上游返回 {status_code}，请查看模型服务日志。",
        )
    return StructuredFailure(
        error_code="model_request_invalid",
        error_category="configuration",
        user_message="模型请求参数无效。",
        hint=f"status={status_code}; body={body_preview}",
    )
