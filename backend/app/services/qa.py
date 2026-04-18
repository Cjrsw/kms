from __future__ import annotations

import json
import re
import time
from collections.abc import AsyncIterator
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.content import NoteChunk
from app.models.user import User
from app.schemas.qa import QaAnswerData, QaFailure, QaResponseEnvelope, QaSourceItem
from app.services.qa_audit import record_qa_audit
from app.services.runtime_llm import (
    ModelInvocationError,
    get_chat_model_name,
    invoke_chat_completion,
    stream_chat_completion,
)
from app.services.search import QaRecallChunk, _build_qa_signal_terms, _compute_qa_query_signal, hybrid_recall_for_qa
from app.services.system_settings import get_qa_system_prompt_setting

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
    _ = model_id  # model selection is disabled by fixed-model policy.
    trace_id = uuid4().hex
    started_at = time.perf_counter()
    normalized_question = question.strip()
    if not normalized_question:
        return _failed(
            error_code="empty_question",
            error_category="validation",
            user_message="Question must not be empty.",
            hint="Please input a question and retry.",
            trace_id=trace_id,
        )

    sources, context_sections, recall_mode = _prepare_sources_and_context(
        db=db,
        user=user,
        question=normalized_question,
        repository_slug=repository_slug,
    )
    if not sources:
        answer_data = _build_empty_answer(
            question=normalized_question,
            recall_mode=recall_mode,
            trace_id=trace_id,
        )
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        record_qa_audit(
            db,
            user=user,
            question=normalized_question,
            repository_slug=repository_slug,
            model_name=get_chat_model_name(),
            status="success",
            trace_id=trace_id,
            latency_ms=latency_ms,
            source_count=0,
            recall_mode=recall_mode,
        )
        return QaResponseEnvelope(status="ok", data=answer_data)

    system_prompt = _resolve_system_prompt(db)
    try:
        answer_text = invoke_chat_completion(
            question=normalized_question,
            context_sections=context_sections,
            system_prompt=system_prompt,
            trace_id=trace_id,
        )
    except ModelInvocationError as exc:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        record_qa_audit(
            db,
            user=user,
            question=normalized_question,
            repository_slug=repository_slug,
            model_name=get_chat_model_name(),
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

    citation_status = _evaluate_citation_status(answer_text, len(sources))
    answer_data = QaAnswerData(
        question=normalized_question,
        answer=answer_text,
        source_count=len(sources),
        sources=sources,
        model_id=None,
        model_name=get_chat_model_name(),
        recall_mode=recall_mode,
        citation_status=citation_status,
        trace_id=trace_id,
    )
    latency_ms = int((time.perf_counter() - started_at) * 1000)
    record_qa_audit(
        db,
        user=user,
        question=normalized_question,
        repository_slug=repository_slug,
        model_name=get_chat_model_name(),
        status="success",
        trace_id=trace_id,
        latency_ms=latency_ms,
        source_count=len(sources),
        recall_mode=recall_mode,
    )
    return QaResponseEnvelope(status="ok", data=answer_data)


async def stream_answer_question(
    db: Session,
    *,
    user: User,
    question: str,
    repository_slug: str | None = None,
    model_id: int | None = None,
) -> AsyncIterator[str]:
    _ = model_id  # model selection is disabled by fixed-model policy.
    trace_id = uuid4().hex
    started_at = time.perf_counter()
    normalized_question = question.strip()
    if not normalized_question:
        failure = QaFailure(
            error_code="empty_question",
            error_category="validation",
            user_message="Question must not be empty.",
            hint="Please input a question and retry.",
            trace_id=trace_id,
        )
        yield _sse("error", failure.model_dump())
        return

    sources, context_sections, recall_mode = _prepare_sources_and_context(
        db=db,
        user=user,
        question=normalized_question,
        repository_slug=repository_slug,
    )
    yield _sse(
        "meta",
        {
            "trace_id": trace_id,
            "recall_mode": recall_mode,
            "model_name": get_chat_model_name(),
            "source_count": len(sources),
            "sources": [source.model_dump() for source in sources],
        },
    )

    if not sources:
        answer_data = _build_empty_answer(
            question=normalized_question,
            recall_mode=recall_mode,
            trace_id=trace_id,
        )
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        record_qa_audit(
            db,
            user=user,
            question=normalized_question,
            repository_slug=repository_slug,
            model_name=get_chat_model_name(),
            status="success",
            trace_id=trace_id,
            latency_ms=latency_ms,
            source_count=0,
            recall_mode=recall_mode,
        )
        yield _sse("done", {"status": "ok", "data": answer_data.model_dump()})
        return

    system_prompt = _resolve_system_prompt(db)
    answer_parts: list[str] = []
    try:
        async for piece in stream_chat_completion(
            question=normalized_question,
            context_sections=context_sections,
            system_prompt=system_prompt,
            trace_id=trace_id,
        ):
            answer_parts.append(piece)
            yield _sse("delta", {"content": piece})
    except ModelInvocationError as exc:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        record_qa_audit(
            db,
            user=user,
            question=normalized_question,
            repository_slug=repository_slug,
            model_name=get_chat_model_name(),
            status="failed",
            error_code=exc.failure.error_code,
            error_category=exc.failure.error_category,
            hint=exc.failure.hint,
            trace_id=trace_id,
            latency_ms=latency_ms,
            source_count=len(sources),
            recall_mode=recall_mode,
        )
        yield _sse(
            "error",
            QaFailure(
                error_code=exc.failure.error_code,
                error_category=exc.failure.error_category,
                user_message=exc.failure.user_message,
                hint=exc.failure.hint,
                trace_id=trace_id,
            ).model_dump(),
        )
        return

    answer_text = "".join(answer_parts).strip() or "I cannot answer this question from the available sources."
    citation_status = _evaluate_citation_status(answer_text, len(sources))
    answer_data = QaAnswerData(
        question=normalized_question,
        answer=answer_text,
        source_count=len(sources),
        sources=sources,
        model_id=None,
        model_name=get_chat_model_name(),
        recall_mode=recall_mode,
        citation_status=citation_status,
        trace_id=trace_id,
    )
    latency_ms = int((time.perf_counter() - started_at) * 1000)
    record_qa_audit(
        db,
        user=user,
        question=normalized_question,
        repository_slug=repository_slug,
        model_name=get_chat_model_name(),
        status="success",
        trace_id=trace_id,
        latency_ms=latency_ms,
        source_count=len(sources),
        recall_mode=recall_mode,
    )
    yield _sse("done", {"status": "ok", "data": answer_data.model_dump()})


def _prepare_sources_and_context(
    *,
    db: Session,
    user: User,
    question: str,
    repository_slug: str | None,
) -> tuple[list[QaSourceItem], list[str], str]:
    top_k = max(1, settings.qa_recall_top_k)
    source_top_n = max(1, settings.qa_source_top_n)
    candidates, recall_mode = hybrid_recall_for_qa(
        db=db,
        user=user,
        query=question,
        repository_slug=repository_slug,
        top_k=top_k,
    )
    candidates = _supplement_same_note_chunks(
        db=db,
        question=question,
        candidates=candidates,
        source_top_n=source_top_n,
    )
    selected_chunks = _select_context_chunks(candidates, source_top_n=source_top_n)
    consolidated_chunks = _consolidate_note_context_chunks(selected_chunks)
    consolidated_chunks = _prune_chunks_for_explicit_title_match(question, consolidated_chunks)
    sources = [_chunk_to_source(chunk) for chunk in consolidated_chunks]
    context_sections = _build_context_sections(consolidated_chunks)
    return sources, context_sections, recall_mode


def _supplement_same_note_chunks(
    *,
    db: Session,
    question: str,
    candidates: list[QaRecallChunk],
    source_top_n: int,
) -> list[QaRecallChunk]:
    if not candidates:
        return candidates

    query_terms = _build_qa_signal_terms(question)
    if not query_terms:
        return candidates

    per_note_limit = max(settings.qa_context_max_chunks_per_note, 1)
    max_notes = max(source_top_n, 3)
    top_note_ids: list[int] = []
    for item in candidates:
        if item.note_id in top_note_ids:
            continue
        top_note_ids.append(item.note_id)
        if len(top_note_ids) >= max_notes:
            break
    if not top_note_ids:
        return candidates

    note_chunks = (
        db.query(NoteChunk)
        .filter(NoteChunk.note_id.in_(top_note_ids))
        .order_by(NoteChunk.note_id.asc(), NoteChunk.chunk_index.asc())
        .all()
    )
    by_note_id: dict[int, list[NoteChunk]] = {}
    for row in note_chunks:
        by_note_id.setdefault(row.note_id, []).append(row)

    enriched = list(candidates)
    existing_keys = {item.chunk_key for item in enriched}
    for note_id in top_note_ids:
        note_candidates = [item for item in enriched if item.note_id == note_id]
        if not note_candidates:
            continue
        if len(note_candidates) >= per_note_limit:
            weakest = min(
                note_candidates,
                key=lambda item: _compute_qa_query_signal(
                    title=item.title,
                    text=item.chunk_text,
                    query_terms=query_terms,
                ),
            )
            weakest_signal = _compute_qa_query_signal(
                title=weakest.title,
                text=weakest.chunk_text,
                query_terms=query_terms,
            )
        else:
            weakest = None
            weakest_signal = -1.0

        reference = note_candidates[0]
        best_extra: QaRecallChunk | None = None
        best_signal = weakest_signal
        for row in by_note_id.get(note_id, []):
            content_text = (row.content_text or "").strip()
            if not content_text:
                continue
            chunk_key = f"{note_id}:{row.chunk_index}:{row.source_type}"
            signal = _compute_qa_query_signal(
                title=reference.title,
                text=content_text,
                query_terms=query_terms,
            )
            if signal <= 0:
                continue
            if chunk_key in existing_keys:
                continue
            if signal <= best_signal:
                continue
            best_signal = signal
            best_extra = QaRecallChunk(
                chunk_key=chunk_key,
                note_id=note_id,
                chunk_index=row.chunk_index,
                source_type=row.source_type,
                repository_slug=reference.repository_slug,
                repository_name=reference.repository_name,
                title=reference.title,
                author_name=reference.author_name,
                chunk_text=content_text,
                snippet=content_text[:320].rstrip(),
                clearance_level=reference.clearance_level,
                attachment_count=reference.attachment_count,
                score=reference.score + float(signal) * 0.01,
                updated_at=reference.updated_at,
                hit_mode=reference.hit_mode,
            )
        if best_extra is None:
            continue

        first_index = next((idx for idx, item in enumerate(enriched) if item.note_id == note_id), None)
        if first_index is None:
            continue

        if weakest is not None:
            weakest_index = next((idx for idx, item in enumerate(enriched) if item.chunk_key == weakest.chunk_key), None)
            if weakest_index is not None:
                enriched.pop(weakest_index)
                if weakest_index < first_index:
                    first_index -= 1

        first_signal = _compute_qa_query_signal(
            title=reference.title,
            text=reference.chunk_text,
            query_terms=query_terms,
        )
        insert_at = first_index if best_signal > first_signal else first_index + 1
        enriched.insert(insert_at, best_extra)
        existing_keys.add(best_extra.chunk_key)

    return enriched


def _select_context_chunks(candidates: list[QaRecallChunk], *, source_top_n: int) -> list[QaRecallChunk]:
    budget = max(settings.qa_context_char_budget, 1000)
    per_note_limit = max(settings.qa_context_max_chunks_per_note, 1)
    selected: list[QaRecallChunk] = []
    note_counts: dict[int, int] = {}
    consumed = 0
    for item in candidates:
        cleaned = _clean_text(item.chunk_text)
        if not cleaned:
            continue
        if selected:
            merged_chunk, added_chars = _merge_adjacent_context_chunk(
                selected[-1],
                item,
                cleaned_text=cleaned,
                remaining_budget=budget - consumed,
            )
            if merged_chunk is not None:
                selected[-1] = merged_chunk
                consumed += added_chars
                continue
        if len(selected) >= source_top_n:
            break
        used_for_note = note_counts.get(item.note_id, 0)
        if used_for_note >= per_note_limit:
            continue
        remaining = budget - consumed
        if remaining <= 0:
            break
        if len(cleaned) > remaining:
            cleaned = cleaned[:remaining].rstrip()
            if not cleaned:
                break
        selected.append(
            QaRecallChunk(
                chunk_key=item.chunk_key,
                note_id=item.note_id,
                chunk_index=item.chunk_index,
                source_type=item.source_type,
                repository_slug=item.repository_slug,
                repository_name=item.repository_name,
                title=item.title,
                author_name=item.author_name,
                chunk_text=cleaned,
                snippet=item.snippet,
                clearance_level=item.clearance_level,
                attachment_count=item.attachment_count,
                score=item.score,
                updated_at=item.updated_at,
                hit_mode=item.hit_mode,
            )
        )
        consumed += len(cleaned)
        note_counts[item.note_id] = used_for_note + 1
    return selected


def _chunk_to_source(chunk: QaRecallChunk) -> QaSourceItem:
    return QaSourceItem(
        note_id=chunk.note_id,
        repository_slug=chunk.repository_slug,
        repository_name=chunk.repository_name,
        title=chunk.title,
        snippet=chunk.snippet,
        clearance_level=chunk.clearance_level,
        attachment_count=chunk.attachment_count,
        updated_at=chunk.updated_at,
    )


def _build_context_sections(chunks: list[QaRecallChunk]) -> list[str]:
    sections: list[str] = []
    for idx, chunk in enumerate(chunks, start=1):
        sections.append(
            (
                f"[{idx}] Title: {chunk.title}\n"
                f"Repository: {chunk.repository_name} ({chunk.repository_slug})\n"
                f"Source: {_format_chunk_locator(chunk)}\n"
                f"Clearance: L{chunk.clearance_level}\n"
                f"Content: {chunk.chunk_text}"
            )
        )
    return sections


def _consolidate_note_context_chunks(chunks: list[QaRecallChunk]) -> list[QaRecallChunk]:
    if not chunks:
        return []
    merged: list[QaRecallChunk] = []
    index_map: dict[tuple[int, str, str, str], int] = {}
    for chunk in chunks:
        merge_key = (chunk.note_id, chunk.source_type, chunk.repository_slug, chunk.title)
        existing_index = index_map.get(merge_key)
        if existing_index is None:
            merged.append(chunk)
            index_map[merge_key] = len(merged) - 1
            continue
        merged[existing_index] = _merge_note_context_chunk(merged[existing_index], chunk)
    return merged


def _prune_chunks_for_explicit_title_match(question: str, chunks: list[QaRecallChunk]) -> list[QaRecallChunk]:
    if len(chunks) <= 1:
        return chunks
    normalized_question = _normalize_match_text(question)
    if not normalized_question:
        return chunks
    matched_note_ids: list[int] = []
    for chunk in chunks:
        normalized_title = _normalize_title_for_match(chunk.title)
        if not normalized_title:
            continue
        if normalized_title in normalized_question and chunk.note_id not in matched_note_ids:
            matched_note_ids.append(chunk.note_id)
    if len(matched_note_ids) != 1:
        return chunks
    target_note_id = matched_note_ids[0]
    pruned = [chunk for chunk in chunks if chunk.note_id == target_note_id]
    return pruned or chunks


def _build_empty_answer(*, question: str, recall_mode: str, trace_id: str) -> QaAnswerData:
    return QaAnswerData(
        question=question,
        answer="I cannot answer this question from the currently visible content.",
        source_count=0,
        sources=[],
        model_id=None,
        model_name=get_chat_model_name(),
        recall_mode=recall_mode,
        citation_status="missing",
        trace_id=trace_id,
    )


def _evaluate_citation_status(answer_text: str, source_count: int) -> str:
    if source_count <= 0:
        return "missing"
    matches = {int(item) for item in REF_RE.findall(answer_text) if item.isdigit()}
    valid = {item for item in matches if 1 <= item <= source_count}
    if not valid:
        return "missing"
    expected = set(range(1, min(source_count, 3) + 1))
    if expected.issubset(valid):
        return "ok"
    return "partial"


def _resolve_system_prompt(db: Session) -> str:
    stored_prompt, _updated_at = get_qa_system_prompt_setting(db)
    if stored_prompt and stored_prompt.strip():
        return stored_prompt.strip()
    return settings.qa_system_prompt_default.strip()


def _clean_text(value: str) -> str:
    text = TAG_RE.sub("", value)
    text = SPACE_RE.sub(" ", text)
    return text.strip()


def _normalize_match_text(value: str) -> str:
    cleaned = _clean_text(value)
    cleaned = re.sub(r"（[^）]*）", "", cleaned)
    cleaned = re.sub(r"\([^)]*\)", "", cleaned)
    cleaned = re.sub(r"[\s\W_]+", "", cleaned, flags=re.UNICODE)
    return cleaned.lower()


def _normalize_title_for_match(title: str) -> str:
    return _normalize_match_text(title)


def _merge_adjacent_context_chunk(
    existing: QaRecallChunk,
    incoming: QaRecallChunk,
    *,
    cleaned_text: str,
    remaining_budget: int,
) -> tuple[QaRecallChunk | None, int]:
    if remaining_budget <= 0:
        return None, 0
    if existing.note_id != incoming.note_id:
        return None, 0
    if existing.source_type != incoming.source_type:
        return None, 0
    if existing.repository_slug != incoming.repository_slug or existing.title != incoming.title:
        return None, 0

    existing_start, existing_end = _chunk_index_bounds(existing)
    incoming_start, incoming_end = _chunk_index_bounds(incoming)
    place_before = incoming_end + 1 == existing_start
    place_after = existing_end + 1 == incoming_start
    if not place_before and not place_after:
        return None, 0

    separator = "\n\n"
    additional_chars = len(cleaned_text) + (len(separator) if existing.chunk_text else 0)
    if additional_chars > remaining_budget:
        return None, 0

    merged_text = (
        f"{cleaned_text}{separator}{existing.chunk_text}"
        if place_before
        else f"{existing.chunk_text}{separator}{cleaned_text}"
    )
    merged_snippet = _merge_snippets(existing.snippet, incoming.snippet, place_before=place_before)
    merged_start = min(existing_start, incoming_start)
    merged_end = max(existing_end, incoming_end)
    merged_hit_mode = _merge_hit_mode(existing.hit_mode, incoming.hit_mode)
    merged_score = max(existing.score, incoming.score)

    return (
        QaRecallChunk(
            chunk_key=f"{existing.note_id}:{merged_start}-{merged_end}:{existing.source_type}",
            note_id=existing.note_id,
            chunk_index=merged_start,
            source_type=existing.source_type,
            repository_slug=existing.repository_slug,
            repository_name=existing.repository_name,
            title=existing.title,
            author_name=existing.author_name,
            chunk_text=merged_text,
            snippet=merged_snippet,
            clearance_level=existing.clearance_level,
            attachment_count=existing.attachment_count,
            score=merged_score,
            updated_at=existing.updated_at,
            hit_mode=merged_hit_mode,
        ),
        additional_chars,
    )


def _merge_note_context_chunk(existing: QaRecallChunk, incoming: QaRecallChunk) -> QaRecallChunk:
    existing_indices = _extract_chunk_indices(existing)
    incoming_indices = _extract_chunk_indices(incoming)
    merged_indices = sorted(set(existing_indices + incoming_indices))
    merged_text_parts = [existing.chunk_text]
    if incoming.chunk_text and incoming.chunk_text not in existing.chunk_text:
        merged_text_parts.append(incoming.chunk_text)
    merged_text = "\n\n".join(part for part in merged_text_parts if part.strip())
    merged_snippet = _merge_snippets(existing.snippet, incoming.snippet, place_before=False)
    merged_hit_mode = _merge_hit_mode(existing.hit_mode, incoming.hit_mode)
    index_part = ",".join(str(item) for item in merged_indices)
    return QaRecallChunk(
        chunk_key=f"{existing.note_id}:{index_part}:{existing.source_type}",
        note_id=existing.note_id,
        chunk_index=min(merged_indices) if merged_indices else existing.chunk_index,
        source_type=existing.source_type,
        repository_slug=existing.repository_slug,
        repository_name=existing.repository_name,
        title=existing.title,
        author_name=existing.author_name,
        chunk_text=merged_text,
        snippet=merged_snippet,
        clearance_level=existing.clearance_level,
        attachment_count=existing.attachment_count,
        score=max(existing.score, incoming.score),
        updated_at=existing.updated_at,
        hit_mode=merged_hit_mode,
    )


def _chunk_index_bounds(chunk: QaRecallChunk) -> tuple[int, int]:
    indices = _extract_chunk_indices(chunk)
    if indices:
        return min(indices), max(indices)
    return chunk.chunk_index, chunk.chunk_index


def _extract_chunk_indices(chunk: QaRecallChunk) -> list[int]:
    parts = chunk.chunk_key.split(":", 2)
    if len(parts) >= 2:
        index_part = parts[1]
        if "," in index_part:
            values: list[int] = []
            for piece in index_part.split(","):
                if piece.isdigit():
                    values.append(int(piece))
            if values:
                return values
        if "-" in index_part:
            start_text, end_text = index_part.split("-", 1)
            if start_text.isdigit() and end_text.isdigit():
                start_value = int(start_text)
                end_value = int(end_text)
                if end_value >= start_value:
                    return list(range(start_value, end_value + 1))
        if index_part.isdigit():
            return [int(index_part)]
    return [chunk.chunk_index]


def _format_chunk_locator(chunk: QaRecallChunk) -> str:
    indices = _extract_chunk_indices(chunk)
    if not indices:
        return f"{chunk.source_type}#{chunk.chunk_index}"
    if len(indices) == 1:
        return f"{chunk.source_type}#{indices[0]}"
    if indices == list(range(indices[0], indices[-1] + 1)):
        return f"{chunk.source_type}#{indices[0]}-{indices[-1]}"
    return f"{chunk.source_type}#{','.join(str(item) for item in indices)}"


def _merge_snippets(existing: str, incoming: str, *, place_before: bool) -> str:
    first = _clean_text(incoming if place_before else existing)
    second = _clean_text(existing if place_before else incoming)
    if not first:
        return second
    if not second or second == first:
        return first
    merged = f"{first} ... {second}"
    return merged[:320].rstrip()


def _merge_hit_mode(existing: str, incoming: str) -> str:
    modes = {existing, incoming}
    if "hybrid" in modes or ("keyword" in modes and "vector" in modes):
        return "hybrid"
    if "vector" in modes:
        return "vector"
    return "keyword"


def _sse(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


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
