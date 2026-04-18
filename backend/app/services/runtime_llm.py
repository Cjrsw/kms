from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings

settings = get_settings()


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


def get_chat_model_name() -> str:
    return settings.qa_chat_model_name.strip()


def is_chat_configured() -> bool:
    return bool(settings.qa_chat_base_url.strip() and settings.qa_chat_model_name.strip())


def is_embedding_configured() -> bool:
    return bool(settings.qa_embed_base_url.strip() and settings.qa_embed_model_name.strip())


def invoke_chat_completion(
    *,
    question: str,
    context_sections: list[str],
    system_prompt: str,
    trace_id: str,
) -> str:
    if not is_chat_configured():
        raise ModelInvocationError(
            StructuredFailure(
                error_code="chat_model_not_configured",
                error_category="configuration",
                user_message="Chat model is not configured.",
                hint="Set QA_CHAT_BASE_URL and QA_CHAT_MODEL_NAME in environment variables.",
            )
        )

    payload = _build_chat_payload(
        question=question,
        context_sections=context_sections,
        system_prompt=system_prompt,
        stream=False,
    )
    endpoint = _resolve_endpoint(settings.qa_chat_base_url, "chat/completions")
    headers = _build_headers(settings.qa_chat_api_key)
    try:
        with httpx.Client(timeout=settings.qa_chat_timeout_seconds) as client:
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
                user_message="Model returned an empty response.",
                hint="Check whether the upstream model supports OpenAI-compatible chat/completions response shape.",
            )
        )
    except httpx.ConnectError as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="network_unreachable",
                error_category="network",
                user_message="Model service network is unreachable.",
                hint=f"trace_id={trace_id}; check QA_CHAT_BASE_URL and network connectivity.",
            )
        ) from exc
    except httpx.TimeoutException as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="model_timeout",
                error_category="timeout",
                user_message="Model invocation timed out.",
                hint=f"trace_id={trace_id}; increase QA_CHAT_TIMEOUT_SECONDS or check upstream latency.",
            )
        ) from exc
    except json.JSONDecodeError as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="invalid_model_response",
                error_category="upstream",
                user_message="Model response is not valid JSON.",
                hint=f"trace_id={trace_id}; verify OpenAI-compatible API behavior.",
            )
        ) from exc


async def stream_chat_completion(
    *,
    question: str,
    context_sections: list[str],
    system_prompt: str,
    trace_id: str,
) -> AsyncIterator[str]:
    if not is_chat_configured():
        raise ModelInvocationError(
            StructuredFailure(
                error_code="chat_model_not_configured",
                error_category="configuration",
                user_message="Chat model is not configured.",
                hint="Set QA_CHAT_BASE_URL and QA_CHAT_MODEL_NAME in environment variables.",
            )
        )

    payload = _build_chat_payload(
        question=question,
        context_sections=context_sections,
        system_prompt=system_prompt,
        stream=True,
    )
    endpoint = _resolve_endpoint(settings.qa_chat_base_url, "chat/completions")
    headers = _build_headers(settings.qa_chat_api_key)
    try:
        async with httpx.AsyncClient(timeout=settings.qa_chat_timeout_seconds) as client:
            async with client.stream("POST", endpoint, headers=headers, json=payload) as response:
                if response.status_code >= 400:
                    body_preview = (await response.aread()).decode(errors="ignore")
                    raise ModelInvocationError(_map_http_error_to_failure_status(response.status_code, body_preview))
                async for line in response.aiter_lines():
                    stripped = line.strip()
                    if not stripped or not stripped.startswith("data:"):
                        continue
                    data_payload = stripped[5:].strip()
                    if not data_payload or data_payload == "[DONE]":
                        continue
                    try:
                        chunk_obj = json.loads(data_payload)
                    except json.JSONDecodeError:
                        continue
                    content = _extract_stream_content(chunk_obj)
                    if content:
                        yield content
    except httpx.ConnectError as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="network_unreachable",
                error_category="network",
                user_message="Model service network is unreachable.",
                hint=f"trace_id={trace_id}; check QA_CHAT_BASE_URL and network connectivity.",
            )
        ) from exc
    except httpx.TimeoutException as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="model_timeout",
                error_category="timeout",
                user_message="Model invocation timed out.",
                hint=f"trace_id={trace_id}; increase QA_CHAT_TIMEOUT_SECONDS or check upstream latency.",
            )
        ) from exc


def invoke_embedding(*, text: str, trace_id: str) -> list[float]:
    if not is_embedding_configured():
        raise ModelInvocationError(
            StructuredFailure(
                error_code="embedding_not_configured",
                error_category="configuration",
                user_message="Embedding model is not configured.",
                hint="Set QA_EMBED_BASE_URL and QA_EMBED_MODEL_NAME in environment variables.",
            )
        )

    payload: dict[str, Any] = {
        "model": settings.qa_embed_model_name.strip(),
        "input": text,
    }
    endpoint = _resolve_endpoint(settings.qa_embed_base_url, "embeddings")
    headers = _build_headers(settings.qa_embed_api_key)
    try:
        with httpx.Client(timeout=settings.qa_embed_timeout_seconds) as client:
            response = client.post(endpoint, headers=headers, json=payload)
        if response.status_code >= 400:
            raise ModelInvocationError(_map_http_error_to_failure(response))
        body = response.json()
        data = body.get("data") or []
        if not data:
            raise ModelInvocationError(
                StructuredFailure(
                    error_code="embedding_empty",
                    error_category="upstream",
                    user_message="Embedding model returned an empty result.",
                    hint=f"trace_id={trace_id}; verify embedding response format.",
                )
            )
        vector = data[0].get("embedding")
        if not isinstance(vector, list) or not vector:
            raise ModelInvocationError(
                StructuredFailure(
                    error_code="embedding_invalid",
                    error_category="upstream",
                    user_message="Embedding response format is invalid.",
                    hint=f"trace_id={trace_id}; expected OpenAI-compatible embeddings response.",
                )
            )
        return [float(item) for item in vector]
    except httpx.ConnectError as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="embedding_network_unreachable",
                error_category="network",
                user_message="Embedding service network is unreachable.",
                hint=f"trace_id={trace_id}; check QA_EMBED_BASE_URL connectivity.",
            )
        ) from exc
    except httpx.TimeoutException as exc:
        raise ModelInvocationError(
            StructuredFailure(
                error_code="embedding_timeout",
                error_category="timeout",
                user_message="Embedding model invocation timed out.",
                hint=f"trace_id={trace_id}; increase QA_EMBED_TIMEOUT_SECONDS or check upstream latency.",
            )
        ) from exc


def _build_chat_payload(
    *,
    question: str,
    context_sections: list[str],
    system_prompt: str,
    stream: bool,
) -> dict[str, Any]:
    source_block = "\n\n".join(context_sections)
    user_prompt = f"Question:\n{question}\n\nSources:\n{source_block}"
    payload: dict[str, Any] = {
        "model": settings.qa_chat_model_name.strip(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "stream": stream,
    }
    if settings.qa_chat_max_tokens is not None and settings.qa_chat_max_tokens > 0:
        payload["max_tokens"] = settings.qa_chat_max_tokens
    return payload


def _extract_stream_content(chunk_obj: dict[str, Any]) -> str:
    choices = chunk_obj.get("choices") or []
    if not choices:
        return ""
    first = choices[0] or {}
    delta = first.get("delta") or {}
    content = delta.get("content")
    if isinstance(content, str) and content:
        return content
    message = first.get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content:
        return content
    return ""


def _build_headers(api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    normalized_key = api_key.strip()
    if normalized_key:
        headers["Authorization"] = f"Bearer {normalized_key}"
    return headers


def _resolve_endpoint(base_url: str, relative_path: str) -> str:
    normalized_base = base_url.rstrip("/")
    if normalized_base.endswith(f"/{relative_path}"):
        return normalized_base
    last_segment = normalized_base.rsplit("/", 1)[-1].lower()
    if last_segment.startswith("v") and last_segment[1:].isdigit():
        return f"{normalized_base}/{relative_path}"
    return f"{normalized_base}/v1/{relative_path}"


def _map_http_error_to_failure(response: httpx.Response) -> StructuredFailure:
    return _map_http_error_to_failure_status(response.status_code, response.text[:220])


def _map_http_error_to_failure_status(status_code: int, body_preview: str) -> StructuredFailure:
    if status_code in {401, 403}:
        return StructuredFailure(
            error_code="model_auth_failed",
            error_category="authentication",
            user_message="Model authentication failed.",
            hint=f"Check API key and headers. status={status_code}; body={body_preview}",
        )
    if status_code == 429:
        return StructuredFailure(
            error_code="model_rate_limited",
            error_category="rate_limit",
            user_message="Model rate limit exceeded.",
            hint="Reduce request concurrency or switch to higher quota.",
        )
    if status_code >= 500:
        return StructuredFailure(
            error_code="model_upstream_error",
            error_category="upstream",
            user_message="Model service is currently unavailable.",
            hint=f"Upstream status={status_code}; check provider logs.",
        )
    return StructuredFailure(
        error_code="model_request_invalid",
        error_category="configuration",
        user_message="Model request was rejected.",
        hint=f"status={status_code}; body={body_preview}",
    )
