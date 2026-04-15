from __future__ import annotations

import html
import re
import time
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User
from app.schemas.qa import QaAnswerData, QaFailure, QaResponseEnvelope, QaSourceItem
from app.services.ai_models import ModelInvocationError, resolve_chat_model, invoke_chat_completion
from app.services.qa_audit import record_qa_audit
from app.services.search import hybrid_recall_for_qa

TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")
REF_RE = re.compile(r"\[(\d+)\]")
settings = get_settings()


def answer_question(
    db: Session,
    *,
    user: User,
    question: str,
    repository_slug: str | None = None,
    model_id: int | None = None,
) -> QaResponseEnvelope:
    trace_id = uuid4().hex
    started_at = time.perf_counter()
    normalized_question = question.strip()
    if not normalized_question:
        return _failed(
            error_code="empty_question",
            error_category="validation",
            user_message="问题不能为空。",
            hint="请输入问题后再发送。",
            trace_id=trace_id,
        )

    top_k = max(1, settings.qa_recall_top_k)
    source_top_n = max(1, settings.qa_source_top_n)
    candidates, recall_mode = hybrid_recall_for_qa(
        db=db,
        user=user,
        query=normalized_question,
        repository_slug=repository_slug,
        top_k=top_k,
    )
    sources = _build_sources(candidates[:source_top_n])

    if not sources:
        answer_data = QaAnswerData(
            question=normalized_question,
            answer="根据当前可见内容无法回答这个问题。你可以换个更具体的问法，或切换知识库范围。",
            source_count=0,
            sources=[],
            model_id=None,
            model_name="",
            recall_mode=recall_mode,
            trace_id=trace_id,
        )
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        record_qa_audit(
            db,
            user=user,
            question=normalized_question,
            repository_slug=repository_slug,
            model=None,
            status="success",
            trace_id=trace_id,
            latency_ms=latency_ms,
            source_count=0,
            recall_mode=recall_mode,
        )
        return QaResponseEnvelope(status="ok", data=answer_data)

    try:
        selected_model = resolve_chat_model(db, user, explicit_model_id=model_id)
    except ModelInvocationError as exc:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        record_qa_audit(
            db,
            user=user,
            question=normalized_question,
            repository_slug=repository_slug,
            model=None,
            status="failed",
            error_code=exc.failure.error_code,
            error_category=exc.failure.error_category,
            hint=exc.failure.hint,
            trace_id=trace_id,
            latency_ms=latency_ms,
            source_count=len(sources),
            recall_mode=recall_mode,
        )
        return _failed_from_structured(exc.failure, trace_id=trace_id)

    context_sections = _build_context_sections(sources)
    try:
        answer_text = invoke_chat_completion(
            selected_model,
            question=normalized_question,
            context_sections=context_sections,
            trace_id=trace_id,
        )
    except ModelInvocationError as exc:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        record_qa_audit(
            db,
            user=user,
            question=normalized_question,
            repository_slug=repository_slug,
            model=selected_model,
            status="failed",
            error_code=exc.failure.error_code,
            error_category=exc.failure.error_category,
            hint=exc.failure.hint,
            trace_id=trace_id,
            latency_ms=latency_ms,
            source_count=len(sources),
            recall_mode=recall_mode,
        )
        return _failed_from_structured(exc.failure, trace_id=trace_id)

    answer_text = _ensure_reference_citations(answer_text, sources)

    answer_data = QaAnswerData(
        question=normalized_question,
        answer=answer_text,
        source_count=len(sources),
        sources=sources,
        model_id=selected_model.id,
        model_name=selected_model.name,
        recall_mode=recall_mode,
        trace_id=trace_id,
    )
    latency_ms = int((time.perf_counter() - started_at) * 1000)
    record_qa_audit(
        db,
        user=user,
        question=normalized_question,
        repository_slug=repository_slug,
        model=selected_model,
        status="success",
        trace_id=trace_id,
        latency_ms=latency_ms,
        source_count=len(sources),
        recall_mode=recall_mode,
    )
    return QaResponseEnvelope(status="ok", data=answer_data)


def _build_sources(candidates: list) -> list[QaSourceItem]:
    return [
        QaSourceItem(
            note_id=result.note_id,
            repository_slug=result.repository_slug,
            repository_name=result.repository_name,
            title=result.title,
            snippet=result.snippet,
            clearance_level=result.clearance_level,
            attachment_count=result.attachment_count,
            updated_at=result.updated_at,
        )
        for result in candidates
    ]


def _build_context_sections(sources: list[QaSourceItem]) -> list[str]:
    sections: list[str] = []
    for idx, source in enumerate(sources, start=1):
        snippet = _clean_snippet(source.snippet)
        sections.append(
            (
                f"[{idx}] 标题: {source.title}\n"
                f"仓库: {source.repository_name} ({source.repository_slug})\n"
                f"密级: L{source.clearance_level}\n"
                f"内容片段: {snippet or '（命中记录但片段为空）'}"
            )
        )
    return sections


def _clean_snippet(snippet: str) -> str:
    text = html.unescape(TAG_RE.sub("", snippet))
    text = SPACE_RE.sub(" ", text).strip()
    if len(text) <= 300:
        return text
    return f"{text[:297]}..."


def _ensure_reference_citations(answer_text: str, sources: list[QaSourceItem]) -> str:
    if not sources:
        return answer_text
    matches = [int(item) for item in REF_RE.findall(answer_text)]
    valid_numbers = sorted({num for num in matches if 1 <= num <= len(sources)})
    if valid_numbers:
        return answer_text
    refs = "".join(f"[{index}]" for index in range(1, min(len(sources), 3) + 1))
    return f"{answer_text}\n\n参考来源：{refs}"


def _failed(
    *,
    error_code: str,
    error_category: str,
    user_message: str,
    hint: str,
    trace_id: str,
) -> QaResponseEnvelope:
    return QaResponseEnvelope(
        status="failed",
        error=QaFailure(
            error_code=error_code,
            error_category=error_category,
            user_message=user_message,
            hint=hint,
            trace_id=trace_id,
        ),
    )


def _failed_from_structured(failure, *, trace_id: str) -> QaResponseEnvelope:
    return _failed(
        error_code=failure.error_code,
        error_category=failure.error_category,
        user_message=failure.user_message,
        hint=failure.hint,
        trace_id=trace_id,
    )
