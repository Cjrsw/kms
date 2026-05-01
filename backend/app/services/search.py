from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from elasticsearch import Elasticsearch
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.content import Attachment, Note, NoteChunk, Repository
from app.models.user import User
from app.schemas.search import SearchResponse, SearchResultItem
from app.services.runtime_llm import ModelInvocationError, invoke_embedding, is_embedding_configured
from app.services.vector_store import (
    delete_points_by_note_id,
    delete_points_by_note_ids,
    list_indexed_note_ids,
    reset_collection,
    search_similar_chunks,
    upsert_chunk_vectors,
)

settings = get_settings()
logger = logging.getLogger(__name__)

NOTES_INDEX = "kms_notes"
TARGET_CHUNK_CHARS = 560
MAX_CHUNK_CHARS = 700
CHUNK_OVERLAP_CHARS = 100
MIN_SIGNAL_TEXT_CHARS = 24
DEFAULT_TOP_K = 8

SYNONYM_GROUPS: list[tuple[str, ...]] = [
    ("\u8003\u52e4", "\u51fa\u52e4", "\u6253\u5361", "kaoqin", "chuqin", "daka"),
    ("\u4eba\u529b", "\u4eba\u529b\u8d44\u6e90", "hr", "renli", "renshiziyuan"),
    ("\u7814\u53d1", "\u6280\u672f", "rd", "yanfa", "jishu"),
    ("\u8fd0\u7ef4", "\u8fd0\u8425", "ops", "yunwei", "yunying"),
    ("\u5236\u5ea6", "\u89c4\u8303", "rule", "guideline"),
]

TOKEN_RE = re.compile(r"[A-Za-z0-9]+|[\u4e00-\u9fff]{1,}")
SENTENCE_RE = re.compile(r".+?(?:[。！？!?；;]+(?:[\"'”’）】])*\s*|$)", re.S)
PLACEHOLDER_RE = re.compile(r"^(?:test|tmp|demo|sample|测试|测试\d+|示例|样例)[-_a-z0-9]*$", re.I)
UPPERCASE_HEADING_RE = re.compile(r"^[A-Z0-9][A-Z0-9\s/&().:_-]{0,39}$")
QA_STOP_TERMS = {
    "这个",
    "那个",
    "这些",
    "那些",
    "怎么",
    "怎样",
    "如何",
    "什么",
    "哪些",
    "哪个",
    "一下",
    "请问",
    "有关",
    "关于",
    "主要",
    "可以",
    "现在",
    "当前",
    "之间",
    "是否",
}
QA_STOP_CHARS = {"的", "了", "和", "与", "及", "在", "于", "为", "是", "吗", "呢", "么", "个", "些", "哪", "之", "相"}


@dataclass
class ChunkDescriptor:
    text: str
    source_type: str
    source_locator: str
    char_start: int
    char_end: int


@dataclass
class QaRecallChunk:
    chunk_key: str
    note_id: int
    chunk_index: int
    source_type: str
    repository_slug: str
    repository_name: str
    title: str
    author_name: str
    chunk_text: str
    snippet: str
    clearance_level: int
    attachment_count: int
    score: float
    updated_at: str
    hit_mode: str = "keyword"


def get_es_client() -> Elasticsearch:
    return Elasticsearch(settings.elasticsearch_url)


def ensure_notes_index() -> None:
    client = get_es_client()
    if client.indices.exists(index=NOTES_INDEX):
        return
    client.indices.create(
        index=NOTES_INDEX,
        mappings={
            "properties": {
                "note_id": {"type": "integer"},
                "repository_id": {"type": "integer"},
                "repository_slug": {"type": "keyword"},
                "repository_name": {"type": "text"},
                "title": {"type": "text"},
                "author_name": {"type": "text"},
                "content_text": {"type": "text"},
                "chunk_index": {"type": "integer"},
                "source_type": {"type": "keyword"},
                "attachment_names": {"type": "text"},
                "attachment_contents": {"type": "text"},
                "clearance_level": {"type": "integer"},
                "attachment_count": {"type": "integer"},
                "has_attachment": {"type": "boolean"},
                "has_pdf": {"type": "boolean"},
                "has_docx": {"type": "boolean"},
                "updated_at": {"type": "date"},
            }
        },
    )


def sync_all_notes(db: Session, *, include_vector: bool = False) -> None:
    ensure_notes_index()
    notes = (
        db.query(Note)
        .options(
            selectinload(Note.repository),
            selectinload(Note.attachments).selectinload(Attachment.extracted_content),
            selectinload(Note.chunks),
        )
        .order_by(Note.id.asc())
        .all()
    )
    for note in notes:
        _upsert_note_document(db, note, include_vector=include_vector)
    cleanup_stale_search_documents(db)
    cleanup_stale_vector_points(db)
    backfill_missing_vector_points(db)


def rebuild_notes_index(db: Session, *, include_vector: bool = False) -> None:
    client = get_es_client()
    if client.indices.exists(index=NOTES_INDEX):
        client.indices.delete(index=NOTES_INDEX)
    if include_vector:
        reset_collection()
        db.query(NoteChunk).delete()
        db.commit()
        ensure_notes_index()
        note_ids = [int(note_id) for note_id, in db.query(Note.id).order_by(Note.id.asc()).all()]
        for note_id in note_ids:
            index_note(db, note_id)
        return
    sync_all_notes(db, include_vector=False)


def index_note(db: Session, note_id: int) -> None:
    ensure_notes_index()
    note = (
        db.query(Note)
        .options(
            selectinload(Note.repository),
            selectinload(Note.attachments).selectinload(Attachment.extracted_content),
            selectinload(Note.chunks),
        )
        .filter(Note.id == note_id)
        .first()
    )
    if note is None:
        return
    _upsert_note_document(db, note, include_vector=True)


def delete_note_document(note_id: int) -> None:
    ensure_notes_index()
    client = get_es_client()
    errors: list[str] = []
    try:
        client.delete_by_query(index=NOTES_INDEX, body={"query": {"term": {"note_id": note_id}}}, refresh=True)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unable to delete Elasticsearch documents for note %s.", note_id)
        errors.append(f"Elasticsearch: {exc}")
    try:
        delete_points_by_note_id(note_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unable to delete Qdrant vectors for note %s.", note_id)
        errors.append(f"Qdrant: {exc}")
    if errors:
        raise RuntimeError("; ".join(errors))


def delete_note_documents(note_ids: list[int]) -> None:
    valid_note_ids = sorted({note_id for note_id in note_ids if isinstance(note_id, int) and note_id > 0})
    if not valid_note_ids:
        return
    ensure_notes_index()
    client = get_es_client()
    errors: list[str] = []
    try:
        client.delete_by_query(
            index=NOTES_INDEX,
            body={"query": {"terms": {"note_id": valid_note_ids}}},
            refresh=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unable to delete Elasticsearch documents for notes %s.", valid_note_ids)
        errors.append(f"Elasticsearch: {exc}")
    try:
        delete_points_by_note_ids(valid_note_ids)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unable to delete Qdrant vectors for notes %s.", valid_note_ids)
        errors.append(f"Qdrant: {exc}")
    if errors:
        raise RuntimeError("; ".join(errors))


def cleanup_stale_vector_points(db: Session) -> list[int]:
    valid_note_ids = {int(note_id) for note_id, in db.query(Note.id).all()}
    indexed_note_ids = list_indexed_note_ids()
    stale_note_ids = sorted(indexed_note_ids - valid_note_ids)
    if not stale_note_ids:
        return []
    delete_points_by_note_ids(stale_note_ids)
    logger.info("Deleted stale Qdrant vectors for missing notes: %s", stale_note_ids)
    return stale_note_ids


def cleanup_stale_search_documents(db: Session) -> list[int]:
    valid_note_ids = {int(note_id) for note_id, in db.query(Note.id).all()}
    ensure_notes_index()
    client = get_es_client()
    response = client.search(
        index=NOTES_INDEX,
        size=0,
        aggs={"note_ids": {"terms": {"field": "note_id", "size": 10000}}},
    )
    indexed_note_ids = {
        int(bucket["key"])
        for bucket in response.get("aggregations", {}).get("note_ids", {}).get("buckets", [])
        if "key" in bucket
    }
    stale_note_ids = sorted(indexed_note_ids - valid_note_ids)
    if not stale_note_ids:
        return []
    client.delete_by_query(
        index=NOTES_INDEX,
        body={"query": {"terms": {"note_id": stale_note_ids}}},
        refresh=True,
    )
    logger.info("Deleted stale Elasticsearch documents for missing notes: %s", stale_note_ids)
    return stale_note_ids


def backfill_missing_vector_points(db: Session) -> list[int]:
    if not is_embedding_configured():
        return []
    valid_note_ids = {int(note_id) for note_id, in db.query(Note.id).all()}
    indexed_note_ids = list_indexed_note_ids()
    missing_note_ids = sorted(valid_note_ids - indexed_note_ids)
    if not missing_note_ids:
        return []

    backfilled: list[int] = []
    for note_id in missing_note_ids:
        try:
            index_note(db, note_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Unable to backfill missing Qdrant vectors for note %s: %s", note_id, exc)
            db.rollback()
            continue
        backfilled.append(note_id)
    if backfilled:
        logger.info("Backfilled missing Qdrant vectors for notes: %s", backfilled)
    return backfilled


def search_notes(
    db: Session,
    user: User,
    query: str,
    repository_slug: str | None = None,
    author_keyword: str | None = None,
    file_type: str = "all",
    updated_from: datetime | None = None,
    updated_to: datetime | None = None,
    sort_by: str = "relevance",
    page: int = 1,
    page_size: int = 10,
) -> SearchResponse:
    normalized_query = query.strip()
    ensure_notes_index()
    client = get_es_client()

    bool_filter: list[dict[str, Any]] = [{"range": {"clearance_level": {"lte": user.clearance_level}}}]
    must_not: list[dict[str, Any]] = []
    if repository_slug or (author_keyword and author_keyword.strip()) or file_type != "all":
        filtered_note_ids = _query_note_ids_by_filters(
            db=db,
            user=user,
            repository_slug=repository_slug,
            author_keyword=author_keyword,
            file_type=file_type,
        )
        if not filtered_note_ids:
            return SearchResponse(total=0, page=page, page_size=page_size, items=[])
        bool_filter.append({"terms": {"note_id": filtered_note_ids}})
    placeholder_note_ids = _query_placeholder_note_ids(
        db=db,
        user=user,
        repository_slug=repository_slug,
        author_keyword=author_keyword,
        file_type=file_type,
    )
    if placeholder_note_ids:
        must_not.append({"terms": {"note_id": placeholder_note_ids}})

    if updated_from or updated_to:
        range_filter: dict[str, str] = {}
        if updated_from:
            range_filter["gte"] = updated_from.isoformat()
        if updated_to:
            range_filter["lte"] = updated_to.isoformat()
        bool_filter.append({"range": {"updated_at": range_filter}})

    query_block: dict[str, Any]
    if normalized_query:
        query_block = {
            "bool": {
                "should": _build_weighted_should_queries(normalized_query),
                "minimum_should_match": 1,
                "filter": bool_filter,
                "must_not": must_not,
            }
        }
    else:
        query_block = {"bool": {"must": [{"match_all": {}}], "filter": bool_filter, "must_not": must_not}}

    offset = (page - 1) * page_size
    candidate_size = page_size
    candidate_offset = offset
    if normalized_query:
        candidate_size = min(max(offset + page_size * 6, 60), 240)
        candidate_offset = 0
    response = client.search(
        index=NOTES_INDEX,
        from_=candidate_offset,
        size=candidate_size,
        track_total_hits=True,
        query=query_block,
        sort=_build_sort(sort_by),
        collapse={"field": "note_id"},
        highlight={
            "fields": {
                "title": {"number_of_fragments": 1},
                "content_text": {"fragment_size": 180, "number_of_fragments": 1},
                "attachment_names": {"fragment_size": 120, "number_of_fragments": 1},
                "attachment_contents": {"fragment_size": 180, "number_of_fragments": 1},
            }
        },
        aggs={
            "unique_notes": {"cardinality": {"field": "note_id", "precision_threshold": 40000}},
        },
    )

    unique_total = int((response.get("aggregations", {}).get("unique_notes", {}) or {}).get("value", 0))
    hits = response.get("hits", {}).get("hits", [])
    if normalized_query:
        ranked_hits = _filter_and_rank_search_hits(hits, normalized_query)
        if ranked_hits:
            unique_total = len(ranked_hits)
            hits = ranked_hits[offset : offset + page_size]
        else:
            hits = hits[offset : offset + page_size]
    items = [
        _hit_to_search_item(hit, hit_mode="keyword")
        for hit in hits
        if hit.get("_source")
    ]
    return SearchResponse(total=unique_total, page=page, page_size=page_size, items=items)


def hybrid_recall_for_qa(
    db: Session,
    *,
    user: User,
    query: str,
    repository_slug: str | None,
    top_k: int | None = None,
) -> tuple[list[QaRecallChunk], str]:
    safe_top_k = max(1, top_k or DEFAULT_TOP_K)
    query_terms = _build_qa_signal_terms(query)

    keyword_chunks = _search_keyword_chunks_for_qa(
        db=db,
        user=user,
        query=query,
        repository_slug=repository_slug,
        limit=max(safe_top_k * 6, 24),
    )

    fused_score: dict[str, float] = {}
    fused_item: dict[str, QaRecallChunk] = {}
    hit_modes: dict[str, set[str]] = {}
    for idx, chunk in enumerate(keyword_chunks):
        key = chunk.chunk_key
        fused_score[key] = fused_score.get(key, 0.0) + 1.0 / (60 + idx + 1)
        fused_item[key] = chunk
        hit_modes.setdefault(key, set()).add("keyword")

    if not is_embedding_configured():
        if not fused_score:
            return [], "keyword"
        final = _sort_fused_chunks(
            fused_score,
            fused_item,
            hit_modes,
            query_terms=query_terms,
            limit=max(safe_top_k * 3, safe_top_k),
            per_note_limit=max(settings.qa_context_max_chunks_per_note, 1),
        )
        final = _finalize_qa_recall_chunks(
            db=db,
            user=user,
            chunks=final,
            query_terms=query_terms,
            repository_slug=repository_slug,
        )
        return final, "keyword"

    try:
        query_vector = invoke_embedding(text=query, trace_id="")
    except ModelInvocationError:
        if not fused_score:
            return [], "keyword"
        final = _sort_fused_chunks(
            fused_score,
            fused_item,
            hit_modes,
            query_terms=query_terms,
            limit=max(safe_top_k * 3, safe_top_k),
            per_note_limit=max(settings.qa_context_max_chunks_per_note, 1),
        )
        final = _finalize_qa_recall_chunks(
            db=db,
            user=user,
            chunks=final,
            query_terms=query_terms,
            repository_slug=repository_slug,
        )
        return final, "keyword"

    vector_hits = search_similar_chunks(
        vector=query_vector,
        max_clearance_level=user.clearance_level,
        repository_slug=repository_slug,
        limit=max(safe_top_k * 8, 36),
    )
    if not vector_hits:
        if not fused_score:
            return [], "keyword"
        final = _sort_fused_chunks(
            fused_score,
            fused_item,
            hit_modes,
            query_terms=query_terms,
            limit=max(safe_top_k * 3, safe_top_k),
            per_note_limit=max(settings.qa_context_max_chunks_per_note, 1),
        )
        final = _finalize_qa_recall_chunks(
            db=db,
            user=user,
            chunks=final,
            query_terms=query_terms,
            repository_slug=repository_slug,
        )
        return final, "keyword"

    vector_note_ids: list[int] = []
    for hit in vector_hits:
        payload = hit.get("payload") or {}
        note_id = payload.get("note_id")
        if isinstance(note_id, int):
            vector_note_ids.append(note_id)
    extra_note_map = _query_notes_for_vector(db, user, vector_note_ids)

    for idx, hit in enumerate(vector_hits):
        payload = hit.get("payload") or {}
        payload_note_id = payload.get("note_id")
        fallback = extra_note_map.get(payload_note_id) if isinstance(payload_note_id, int) else None
        from_vector = _build_qa_chunk_from_vector_payload(payload, fallback)
        if from_vector is None:
            continue
        key = from_vector.chunk_key
        fused_score[key] = fused_score.get(key, 0.0) + 1.0 / (60 + idx + 1)
        hit_modes.setdefault(key, set()).add("vector")
        if key not in fused_item:
            fused_item[key] = from_vector

    final = _sort_fused_chunks(
        fused_score,
        fused_item,
        hit_modes,
        query_terms=query_terms,
        limit=max(safe_top_k * 3, safe_top_k),
        per_note_limit=max(settings.qa_context_max_chunks_per_note, 1),
    )
    final = _finalize_qa_recall_chunks(
        db=db,
        user=user,
        chunks=final,
        query_terms=query_terms,
        repository_slug=repository_slug,
    )
    if not final:
        return [], "keyword"
    has_vector = any(item.hit_mode in {"vector", "hybrid"} for item in final)
    has_keyword = any(item.hit_mode in {"keyword", "hybrid"} for item in final)
    if has_vector and has_keyword:
        recall_mode = "hybrid"
    elif has_vector:
        recall_mode = "vector"
    else:
        recall_mode = "keyword"
    return final, recall_mode


def _finalize_qa_recall_chunks(
    *,
    db: Session,
    user: User,
    chunks: list[QaRecallChunk],
    query_terms: list[str],
    repository_slug: str | None,
) -> list[QaRecallChunk]:
    positive_chunks = _prefer_positive_signal_chunks(chunks, query_terms=query_terms)
    return _filter_existing_qa_recall_chunks(
        db=db,
        user=user,
        chunks=positive_chunks,
        repository_slug=repository_slug,
    )


def _filter_existing_qa_recall_chunks(
    *,
    db: Session,
    user: User,
    chunks: list[QaRecallChunk],
    repository_slug: str | None,
) -> list[QaRecallChunk]:
    note_ids = sorted({chunk.note_id for chunk in chunks if chunk.note_id > 0})
    if not note_ids:
        return []

    note_query = (
        db.query(Note)
        .join(Repository, Repository.id == Note.repository_id)
        .options(selectinload(Note.repository), selectinload(Note.attachments))
        .filter(
            Note.id.in_(note_ids),
            Note.min_clearance_level <= user.clearance_level,
            Repository.min_clearance_level <= user.clearance_level,
        )
    )
    if repository_slug:
        note_query = note_query.filter(Repository.slug == repository_slug)

    notes_by_id = {note.id: note for note in note_query.all() if note.repository is not None}
    filtered: list[QaRecallChunk] = []
    for chunk in chunks:
        note = notes_by_id.get(chunk.note_id)
        if note is None or note.repository is None:
            continue
        filtered.append(
            QaRecallChunk(
                chunk_key=chunk.chunk_key,
                note_id=note.id,
                chunk_index=chunk.chunk_index,
                source_type=chunk.source_type,
                repository_slug=note.repository.slug,
                repository_name=note.repository.name,
                title=note.title,
                author_name=note.author_name or "system",
                chunk_text=chunk.chunk_text,
                snippet=chunk.snippet,
                clearance_level=note.min_clearance_level,
                attachment_count=len(note.attachments),
                score=chunk.score,
                updated_at=note.updated_at.isoformat(),
                hit_mode=chunk.hit_mode,
            )
        )
    return filtered


def _search_keyword_chunks_for_qa(
    db: Session,
    *,
    user: User,
    query: str,
    repository_slug: str | None,
    limit: int,
) -> list[QaRecallChunk]:
    normalized_query = query.strip()
    if not normalized_query:
        return []
    query_terms = _build_qa_signal_terms(normalized_query)

    ensure_notes_index()
    client = get_es_client()
    bool_filter: list[dict[str, Any]] = [{"range": {"clearance_level": {"lte": user.clearance_level}}}]
    if repository_slug:
        bool_filter.append({"term": {"repository_slug": repository_slug}})

    response = client.search(
        index=NOTES_INDEX,
        size=max(limit, 1),
        track_total_hits=False,
        query={
            "bool": {
                "should": _build_weighted_should_queries(normalized_query),
                "minimum_should_match": 1,
                "filter": bool_filter,
            }
        },
        sort=["_score", {"updated_at": "desc"}],
        highlight={
            "fields": {
                "content_text": {"fragment_size": 220, "number_of_fragments": 1},
                "title": {"number_of_fragments": 1},
            }
        },
    )

    chunks: list[QaRecallChunk] = []
    for hit in response.get("hits", {}).get("hits", []):
        source = hit.get("_source") or {}
        note_id = int(source.get("note_id", 0))
        chunk_index = int(source.get("chunk_index", -1))
        source_type = str(source.get("source_type", "note"))
        content_text = str(source.get("content_text", "")).strip()
        if note_id <= 0 or chunk_index < 0 or not content_text:
            continue
        title = str(source.get("title", ""))
        if _is_low_signal_chunk(content_text, title=title):
            continue
        if query_terms and _compute_qa_query_signal(title=title, text=content_text, query_terms=query_terms) <= 0:
            continue
        chunk_key = f"{note_id}:{chunk_index}:{source_type}"
        chunks.append(
            QaRecallChunk(
                chunk_key=chunk_key,
                note_id=note_id,
                chunk_index=chunk_index,
                source_type=source_type,
                repository_slug=str(source.get("repository_slug", "")),
                repository_name=str(source.get("repository_name", "")),
                title=title,
                author_name=str(source.get("author_name", "system")),
                chunk_text=content_text,
                snippet=_build_snippet(hit, source),
                clearance_level=int(source.get("clearance_level", 1)),
                attachment_count=int(source.get("attachment_count", 0)),
                score=float(hit.get("_score") or 0.0),
                updated_at=str(source.get("updated_at", "")),
                hit_mode="keyword",
            )
        )
    return chunks


def suggest_search_queries(
    db: Session,
    user: User,
    query: str,
    repository_slug: str | None = None,
    limit: int = 8,
) -> list[str]:
    normalized_query = query.strip()
    if not normalized_query:
        return []
    ensure_notes_index()
    client = get_es_client()

    bool_filter: list[dict[str, Any]] = [{"range": {"clearance_level": {"lte": user.clearance_level}}}]
    if repository_slug:
        bool_filter.append({"term": {"repository_slug": repository_slug}})

    expanded_terms = _expand_query_terms(normalized_query)
    should: list[dict[str, Any]] = []
    for term in expanded_terms:
        should.append({"match_phrase_prefix": {"title": {"query": term}}})
        should.append({"match_phrase_prefix": {"repository_name": {"query": term}}})

    response = client.search(
        index=NOTES_INDEX,
        size=max(limit * 3, 20),
        _source=["title", "repository_name"],
        query={"bool": {"should": should, "minimum_should_match": 1, "filter": bool_filter}},
        sort=["_score", {"updated_at": "desc"}],
        collapse={"field": "note_id"},
    )

    suggestions: list[str] = []
    seen: set[str] = set()
    for alias in _suggest_from_alias(normalized_query):
        if alias not in seen:
            seen.add(alias)
            suggestions.append(alias)
        if len(suggestions) >= limit:
            return suggestions

    for hit in response.get("hits", {}).get("hits", []):
        source = hit.get("_source", {})
        title = str(source.get("title", "")).strip()
        if not title or title in seen:
            continue
        seen.add(title)
        suggestions.append(title)
        if len(suggestions) >= limit:
            break
    return suggestions


def suggest_author_names(
    db: Session,
    user: User,
    keyword: str | None = None,
    repository_slug: str | None = None,
    limit: int = 20,
) -> list[str]:
    normalized_keyword = (keyword or "").strip().lower()
    max_candidates = max(limit * 3, 30)

    note_name_query = (
        db.query(Note.author_name)
        .join(Repository, Repository.id == Note.repository_id)
        .filter(Note.min_clearance_level <= user.clearance_level)
        .filter(Note.author_name.isnot(None))
        .filter(func.length(func.trim(Note.author_name)) > 0)
    )
    if repository_slug:
        note_name_query = note_name_query.filter(Repository.slug == repository_slug)
    if normalized_keyword:
        note_name_query = note_name_query.filter(func.lower(Note.author_name).like(f"%{normalized_keyword}%"))
    note_name_rows = (
        note_name_query.group_by(Note.author_name).order_by(func.count(Note.id).desc(), Note.author_name.asc()).limit(max_candidates).all()
    )

    user_name_query = db.query(User.full_name, User.username).filter(User.is_active.is_(True))
    if normalized_keyword:
        user_name_query = user_name_query.filter(
            or_(
                func.lower(User.full_name).like(f"%{normalized_keyword}%"),
                func.lower(User.username).like(f"%{normalized_keyword}%"),
            )
        )
    user_name_rows = user_name_query.order_by(User.full_name.asc(), User.username.asc()).limit(max_candidates).all()

    suggestions: list[str] = []
    seen: set[str] = set()
    for (author_name,) in note_name_rows:
        candidate = (author_name or "").strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        suggestions.append(candidate)
        if len(suggestions) >= limit:
            return suggestions
    for full_name, username in user_name_rows:
        candidate = (full_name or "").strip() or (username or "").strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        suggestions.append(candidate)
        if len(suggestions) >= limit:
            break
    return suggestions


def _query_note_ids_by_filters(
    db: Session,
    user: User,
    repository_slug: str | None,
    author_keyword: str | None,
    file_type: str,
) -> list[int]:
    query = (
        db.query(Note.id)
        .join(Repository, Repository.id == Note.repository_id)
        .filter(Note.min_clearance_level <= user.clearance_level)
    )
    if repository_slug:
        query = query.filter(Repository.slug == repository_slug)
    if author_keyword and author_keyword.strip():
        author = author_keyword.strip().lower()
        query = query.filter(func.lower(Note.author_name).like(f"%{author}%"))
    if file_type == "note":
        query = query.filter(~Note.attachments.any())
    elif file_type in {"pdf", "docx"}:
        query = query.filter(Note.attachments.any(func.lower(Attachment.file_type) == file_type))
    rows = query.all()
    return [int(row[0]) for row in rows]


def _query_placeholder_note_ids(
    db: Session,
    user: User,
    repository_slug: str | None,
    author_keyword: str | None,
    file_type: str,
) -> list[int]:
    query = (
        db.query(Note.id, Note.title, Note.content_text)
        .join(Repository, Repository.id == Note.repository_id)
        .filter(Note.min_clearance_level <= user.clearance_level)
    )
    if repository_slug:
        query = query.filter(Repository.slug == repository_slug)
    if author_keyword and author_keyword.strip():
        author = author_keyword.strip().lower()
        query = query.filter(func.lower(Note.author_name).like(f"%{author}%"))
    if file_type == "note":
        query = query.filter(~Note.attachments.any())
    elif file_type in {"pdf", "docx"}:
        query = query.filter(Note.attachments.any(func.lower(Attachment.file_type) == file_type))

    rows = query.all()
    placeholder_ids: list[int] = []
    for note_id, title, content_text in rows:
        if _is_placeholder_note(title=title or "", content_text=content_text or ""):
            placeholder_ids.append(int(note_id))
    return placeholder_ids


def _is_placeholder_note(*, title: str, content_text: str) -> bool:
    title_compact = re.sub(r"\s+", "", title).strip().lower()
    content_compact = re.sub(r"\s+", "", content_text).strip().lower()
    if not title_compact:
        return False
    if title_compact == content_compact and _is_low_signal_chunk(content_text, title=title):
        return True
    return bool(PLACEHOLDER_RE.fullmatch(title_compact) and _is_low_signal_chunk(content_text or title, title=title))


def _filter_and_rank_search_hits(hits: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    query_terms = _build_qa_signal_terms(query)
    normalized_query = re.sub(r"\s+", "", query).strip().lower()
    scored_hits: list[tuple[float, float, dict[str, Any]]] = []
    positive_exists = False
    for hit in hits:
        source = hit.get("_source") or {}
        title = str(source.get("title", ""))
        text = str(source.get("content_text", ""))
        signal = _compute_search_query_signal(
            title=title,
            text=text,
            normalized_query=normalized_query,
            query_terms=query_terms,
        )
        if signal > 0:
            positive_exists = True
        scored_hits.append((signal, float(hit.get("_score") or 0.0), hit))
    if positive_exists:
        scored_hits = [item for item in scored_hits if item[0] > 0]
    scored_hits.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [item[2] for item in scored_hits]


def _compute_search_query_signal(
    *,
    title: str,
    text: str,
    normalized_query: str,
    query_terms: list[str],
) -> float:
    title_compact = re.sub(r"\s+", "", title).strip().lower()
    text_compact = re.sub(r"\s+", "", text).strip().lower()
    score = 0.0
    if normalized_query:
        if normalized_query in title_compact:
            score += 8.0
        elif normalized_query in text_compact:
            score += 4.0
    for term in query_terms:
        if term in title_compact:
            score += 2.0
            continue
        if term in text_compact:
            score += 0.8
    return score


def _build_sort(sort_by: str) -> list[Any]:
    if sort_by == "updated_desc":
        return [{"updated_at": "desc"}, "_score"]
    if sort_by == "updated_asc":
        return [{"updated_at": "asc"}, "_score"]
    return ["_score", {"updated_at": "desc"}]


def _build_weighted_should_queries(query: str) -> list[dict[str, Any]]:
    expanded_terms = _expand_query_terms(query)
    tokens = _tokenize_query(query)
    should: list[dict[str, Any]] = []

    for term in expanded_terms:
        is_original = term == query.strip()
        should.append(
            {
                "multi_match": {
                    "query": term,
                    "fields": [
                        "title^5.0",
                        "repository_name^2.0",
                        "author_name^1.7",
                        "attachment_names^2.6",
                        "content_text^1.6",
                        "attachment_contents^1.4",
                    ],
                    "type": "best_fields",
                    "boost": 2.4 if is_original else 1.3,
                }
            }
        )

    for token in tokens:
        token_boost = _token_boost(token)
        should.append({"match_phrase": {"title": {"query": token, "boost": 4.0 * token_boost}}})
        should.append({"match_phrase": {"attachment_names": {"query": token, "boost": 2.8 * token_boost}}})
        should.append({"match": {"content_text": {"query": token, "boost": 1.6 * token_boost}}})
        should.append({"match": {"attachment_contents": {"query": token, "boost": 1.4 * token_boost}}})

    return should


def _tokenize_query(query: str) -> list[str]:
    tokens = TOKEN_RE.findall(query.lower())
    unique: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        normalized = token.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


def _build_qa_signal_terms(query: str) -> list[str]:
    signals: list[str] = []
    seen: set[str] = set()
    for token in TOKEN_RE.findall(query.lower()):
        normalized = token.strip()
        if not normalized:
            continue
        if re.fullmatch(r"[\u4e00-\u9fff]+", normalized):
            if len(normalized) == 2:
                if normalized not in QA_STOP_TERMS and normalized not in seen:
                    seen.add(normalized)
                    signals.append(normalized)
                continue
            if len(normalized) < 2:
                continue
            for idx in range(len(normalized) - 1):
                piece = normalized[idx : idx + 2]
                if any(char in QA_STOP_CHARS for char in piece):
                    continue
                if piece in QA_STOP_TERMS or piece in seen:
                    continue
                seen.add(piece)
                signals.append(piece)
            continue
        if len(normalized) >= 2 and normalized not in QA_STOP_TERMS and normalized not in seen:
            seen.add(normalized)
            signals.append(normalized)
    return signals


def _compute_qa_query_signal(*, title: str, text: str, query_terms: list[str]) -> float:
    if not query_terms:
        return 0.0
    title_compact = re.sub(r"\s+", "", title).strip().lower()
    text_compact = re.sub(r"\s+", "", text).strip().lower()
    score = 0.0
    for term in query_terms:
        if term in title_compact:
            score += 2.0
            continue
        if term in text_compact:
            score += 1.0
    return score


def _token_boost(token: str) -> float:
    if re.fullmatch(r"[\u4e00-\u9fff]+", token):
        return 1.4 if len(token) >= 2 else 1.1
    if token.isdigit():
        return 1.15
    return 1.25 if len(token) >= 3 else 1.0


def _hit_to_search_item(hit: dict[str, Any], *, hit_mode: str) -> SearchResultItem:
    source = hit.get("_source", {})
    return SearchResultItem(
        note_id=int(source.get("note_id", 0)),
        repository_slug=str(source.get("repository_slug", "")),
        repository_name=str(source.get("repository_name", "")),
        title=str(source.get("title", "")),
        author_name=str(source.get("author_name", "系统")),
        snippet=_build_snippet(hit, source),
        clearance_level=int(source.get("clearance_level", 1)),
        attachment_count=int(source.get("attachment_count", 0)),
        score=float(hit.get("_score") or 0.0),
        updated_at=str(source.get("updated_at", "")),
        hit_mode=hit_mode,
    )


def _build_qa_chunk_from_vector_payload(payload: dict[str, Any], fallback: dict[str, Any] | None) -> QaRecallChunk | None:
    note_id = payload.get("note_id")
    chunk_index = payload.get("chunk_index")
    if not isinstance(note_id, int) or not isinstance(chunk_index, int):
        return None
    if fallback is None:
        return None

    source_type = str(payload.get("source_type") or "note")
    repository_slug = str(fallback.get("repository_slug") or payload.get("repository_slug") or "")
    repository_name = str(fallback.get("repository_name") or payload.get("repository_name") or "")
    title = str(fallback.get("title") or payload.get("title") or f"Note #{note_id}")
    author_name = str(fallback.get("author_name") or payload.get("author_name") or "system")
    clearance = int(fallback.get("clearance_level") or payload.get("clearance_level") or 1)
    updated_at = str(fallback.get("updated_at") or payload.get("updated_at") or "")
    attachment_count = int(fallback.get("attachment_count") or payload.get("attachment_count") or 0)
    chunk_text = str(payload.get("chunk_text") or "").strip()
    if not chunk_text:
        return None
    if _is_low_signal_chunk(chunk_text, title=title):
        return None
    chunk_key = f"{note_id}:{chunk_index}:{source_type}"
    return QaRecallChunk(
        chunk_key=chunk_key,
        note_id=note_id,
        chunk_index=chunk_index,
        source_type=source_type,
        repository_slug=repository_slug,
        repository_name=repository_name,
        title=title,
        author_name=author_name,
        chunk_text=chunk_text,
        snippet=chunk_text,
        clearance_level=clearance,
        attachment_count=attachment_count,
        score=0.0,
        updated_at=updated_at,
        hit_mode="vector",
    )


def _query_notes_for_vector(db: Session, user: User, note_ids: list[int]) -> dict[int, dict[str, Any]]:
    unique_ids = sorted(set(note_ids))
    if not unique_ids:
        return {}
    notes = (
        db.query(Note)
        .join(Repository, Repository.id == Note.repository_id)
        .filter(
            Note.id.in_(unique_ids),
            Note.min_clearance_level <= user.clearance_level,
            Repository.min_clearance_level <= user.clearance_level,
        )
        .all()
    )
    result: dict[int, dict[str, Any]] = {}
    for note in notes:
        result[note.id] = {
            "repository_slug": note.repository.slug if note.repository else "",
            "repository_name": note.repository.name if note.repository else "",
            "title": note.title,
            "author_name": note.author_name or "系统",
            "clearance_level": note.min_clearance_level,
            "updated_at": note.updated_at.isoformat(),
            "attachment_count": len(note.attachments),
        }
    return result


def _sort_fused_chunks(
    score_map: dict[str, float],
    item_map: dict[str, QaRecallChunk],
    hit_modes: dict[str, set[str]],
    *,
    query_terms: list[str],
    limit: int,
    per_note_limit: int,
) -> list[QaRecallChunk]:
    reranked_score: dict[str, float] = {}
    for key, base_score in score_map.items():
        item = item_map.get(key)
        if item is None:
            continue
        modes = hit_modes.get(key, {"keyword"})
        signal_score = _compute_qa_query_signal(title=item.title, text=item.chunk_text, query_terms=query_terms)
        mode_bonus = 0.002 if "keyword" in modes and "vector" in modes else 0.0
        reranked_score[key] = base_score + min(signal_score, 6.0) * 0.004 + mode_bonus
    ordered_keys = sorted(reranked_score.keys(), key=lambda key: reranked_score[key], reverse=True)
    items: list[QaRecallChunk] = []
    note_counts: dict[int, int] = {}
    for key in ordered_keys:
        if len(items) >= limit:
            break
        item = item_map.get(key)
        if item is None:
            continue
        used_for_note = note_counts.get(item.note_id, 0)
        if used_for_note >= per_note_limit:
            continue

        modes = hit_modes.get(key, {"keyword"})
        if "keyword" in modes and "vector" in modes:
            item.hit_mode = "hybrid"
        elif "vector" in modes:
            item.hit_mode = "vector"
        else:
            item.hit_mode = "keyword"
        item.score = reranked_score.get(key, score_map.get(key, item.score))
        items.append(item)
        note_counts[item.note_id] = used_for_note + 1
    return items


def _prefer_positive_signal_chunks(chunks: list[QaRecallChunk], *, query_terms: list[str]) -> list[QaRecallChunk]:
    if not chunks or not query_terms:
        return chunks
    positive = [
        item
        for item in chunks
        if _compute_qa_query_signal(title=item.title, text=item.chunk_text, query_terms=query_terms) > 0
    ]
    return positive if positive else chunks


def _upsert_note_document(db: Session, note: Note, *, include_vector: bool) -> None:
    repository = note.repository
    if repository is None:
        return

    chunk_descriptors = _build_note_chunks(note)
    if not chunk_descriptors:
        chunk_descriptors = [
            ChunkDescriptor(
                text=(note.content_text or note.title or "").strip(),
                source_type="note",
                source_locator="{}",
                char_start=0,
                char_end=max(len(note.content_text or ""), 0),
            )
        ]
    chunk_descriptors = [chunk for chunk in chunk_descriptors if chunk.text.strip()]
    if not chunk_descriptors:
        return

    attachment_names = [attachment.file_name for attachment in note.attachments]
    attachment_contents = [
        attachment.extracted_content.extracted_text
        for attachment in note.attachments
        if attachment.extracted_content and attachment.extracted_content.extracted_text.strip()
    ]
    file_types = {attachment.file_type.lower() for attachment in note.attachments}

    client = get_es_client()
    client.delete_by_query(index=NOTES_INDEX, body={"query": {"term": {"note_id": note.id}}}, refresh=True)
    if include_vector:
        delete_points_by_note_id(note.id)
    db.query(NoteChunk).filter(NoteChunk.note_id == note.id).delete()
    db.commit()

    note_chunks: list[NoteChunk] = []
    for idx, chunk in enumerate(chunk_descriptors):
        es_id = f"note-{note.id}-chunk-{idx}"
        note_chunk = NoteChunk(
            note_id=note.id,
            chunk_index=idx,
            content_text=chunk.text,
            es_document_id=es_id,
            source_type=chunk.source_type,
            source_locator=chunk.source_locator,
            char_start=chunk.char_start,
            char_end=chunk.char_end,
        )
        db.add(note_chunk)
        note_chunks.append(note_chunk)
        document = {
            "note_id": note.id,
            "chunk_index": idx,
            "repository_id": note.repository_id,
            "repository_slug": repository.slug,
            "repository_name": repository.name,
            "title": note.title,
            "author_name": (note.author_name or "").strip() or "系统",
            "content_text": chunk.text,
            "source_type": chunk.source_type,
            "attachment_names": " ".join(attachment_names),
            "attachment_contents": "\n".join(attachment_contents),
            "clearance_level": note.min_clearance_level,
            "attachment_count": len(note.attachments),
            "has_attachment": bool(note.attachments),
            "has_pdf": "pdf" in file_types,
            "has_docx": "docx" in file_types,
            "updated_at": note.updated_at.isoformat(),
        }
        client.index(index=NOTES_INDEX, id=es_id, document=document, refresh=False)
    db.flush()

    should_index_vector = include_vector and is_embedding_configured()
    if should_index_vector:
        vectors: list[list[float]] = []
        payloads: list[dict[str, Any]] = []
        valid_chunks: list[NoteChunk] = []
        for chunk_row in note_chunks:
            try:
                vector = invoke_embedding(text=chunk_row.content_text, trace_id="")
            except ModelInvocationError:
                continue
            vectors.append(vector)
            payloads.append(
                {
                    "note_id": note.id,
                    "repository_slug": repository.slug,
                    "repository_name": repository.name,
                    "title": note.title,
                    "author_name": (note.author_name or "").strip() or "系统",
                    "chunk_index": chunk_row.chunk_index,
                    "chunk_text": chunk_row.content_text,
                    "source_type": chunk_row.source_type,
                    "clearance_level": note.min_clearance_level,
                    "attachment_count": len(note.attachments),
                    "updated_at": note.updated_at.isoformat(),
                }
            )
            valid_chunks.append(chunk_row)
        if vectors:
            try:
                point_ids = upsert_chunk_vectors(vectors=vectors, payloads=payloads)
                for idx, point_id in enumerate(point_ids):
                    valid_chunks[idx].vector_point_id = point_id
            except Exception:
                # Keep keyword indexing available even if vector backend is temporarily unavailable.
                pass

    db.commit()
    client.indices.refresh(index=NOTES_INDEX)


def _build_note_chunks(note: Note) -> list[ChunkDescriptor]:
    chunks: list[ChunkDescriptor] = []
    note_text = (note.content_text or "").strip()
    if note_text:
        chunks.extend(_build_chunks_from_text(note_text, source_type="note", locator_base={"note_id": note.id}))

    for attachment in note.attachments:
        extracted_text = (attachment.extracted_content.extracted_text if attachment.extracted_content else "").strip()
        if not extracted_text:
            continue
        if attachment.file_type.lower() == "pdf":
            chunks.extend(_build_pdf_chunks(attachment.id, attachment.file_name, extracted_text))
            continue
        if attachment.file_type.lower() == "docx":
            chunks.extend(_build_docx_chunks(attachment.id, attachment.file_name, extracted_text))
            continue
        chunks.extend(
            _build_chunks_from_text(
                extracted_text,
                source_type="attachment_text",
                locator_base={"attachment_id": attachment.id, "file_name": attachment.file_name},
            )
        )
    return chunks


def _build_pdf_chunks(attachment_id: int, file_name: str, text: str) -> list[ChunkDescriptor]:
    pages = [page.strip() for page in text.split("\f") if page.strip()]
    if not pages:
        pages = [text]
    chunks: list[ChunkDescriptor] = []
    cursor = 0
    for page_idx, page_text in enumerate(pages, start=1):
        page_chunks = _build_chunks_from_text(
            page_text,
            source_type="attachment_pdf",
            locator_base={"attachment_id": attachment_id, "file_name": file_name, "page": page_idx},
            global_offset=cursor,
        )
        chunks.extend(page_chunks)
        cursor += len(page_text) + 1
    return chunks


def _build_docx_chunks(attachment_id: int, file_name: str, text: str) -> list[ChunkDescriptor]:
    paragraphs = _split_paragraph_entries(text)
    if not paragraphs:
        paragraphs = [(1, text, 0, len(text))]
    chunks: list[ChunkDescriptor] = []
    current_heading = ""
    buffered_parts: list[str] = []
    buffered_start = 0
    buffered_end = 0
    buffered_paragraph_start = 0
    buffered_paragraph_end = 0

    def flush_buffer() -> None:
        nonlocal buffered_parts, buffered_start, buffered_end, buffered_paragraph_start, buffered_paragraph_end
        if not buffered_parts:
            return
        merged_body = "\n\n".join(buffered_parts).strip()
        if not merged_body:
            buffered_parts = []
            return
        scoped_text = f"{current_heading}\n{merged_body}".strip() if current_heading else merged_body
        locator = {
            "attachment_id": attachment_id,
            "file_name": file_name,
            "paragraph_start": buffered_paragraph_start,
            "paragraph_end": buffered_paragraph_end,
            "heading": current_heading,
        }
        chunks.extend(
            _build_chunks_from_block(
                scoped_text,
                source_type="attachment_docx",
                locator=locator,
                base_start=buffered_start,
            )
        )
        buffered_parts = []
        buffered_start = 0
        buffered_end = 0
        buffered_paragraph_start = 0
        buffered_paragraph_end = 0

    for paragraph_index, paragraph, paragraph_start, paragraph_end in paragraphs:
        if _looks_like_heading(paragraph):
            flush_buffer()
            current_heading = paragraph
            continue

        candidate_parts = buffered_parts + [paragraph]
        candidate_body = "\n\n".join(candidate_parts).strip()
        candidate_length = len(candidate_body) + (len(current_heading) + 1 if current_heading else 0)
        if buffered_parts and candidate_length > MAX_CHUNK_CHARS:
            flush_buffer()
            candidate_parts = [paragraph]
            candidate_body = paragraph

        if not buffered_parts:
            buffered_start = paragraph_start
            buffered_paragraph_start = paragraph_index
        buffered_parts = candidate_parts
        buffered_end = paragraph_end
        buffered_paragraph_end = paragraph_index

        current_length = len(candidate_body) + (len(current_heading) + 1 if current_heading else 0)
        if current_length >= TARGET_CHUNK_CHARS:
            flush_buffer()

    flush_buffer()
    return chunks


def _build_chunks_from_text(
    text: str,
    *,
    source_type: str,
    locator_base: dict[str, Any],
    global_offset: int = 0,
) -> list[ChunkDescriptor]:
    paragraphs = _split_paragraph_entries(text)
    if not paragraphs:
        paragraphs = [(1, text.strip(), 0, len(text.strip()))]
    chunks: list[ChunkDescriptor] = []
    for paragraph_index, paragraph, local_start, local_end in paragraphs:
        if not paragraph:
            continue
        locator = dict(locator_base)
        locator["paragraph"] = paragraph_index

        if len(paragraph) <= MAX_CHUNK_CHARS:
            descriptor = _make_chunk_descriptor(
                text=paragraph,
                source_type=source_type,
                locator=locator,
                char_start=global_offset + local_start,
                char_end=global_offset + local_end,
            )
            if descriptor is not None:
                chunks.append(descriptor)
            continue

        chunks.extend(
            _build_sentence_aware_chunks(
                paragraph,
                source_type=source_type,
                locator=locator,
                base_start=global_offset + local_start,
            )
        )
    return chunks


def _build_chunks_from_block(
    text: str,
    *,
    source_type: str,
    locator: dict[str, Any],
    base_start: int,
) -> list[ChunkDescriptor]:
    normalized = text.strip()
    if not normalized:
        return []
    if len(normalized) <= MAX_CHUNK_CHARS:
        descriptor = _make_chunk_descriptor(
            text=normalized,
            source_type=source_type,
            locator=locator,
            char_start=base_start,
            char_end=base_start + len(normalized),
        )
        return [descriptor] if descriptor is not None else []
    return _build_sentence_aware_chunks(
        normalized,
        source_type=source_type,
        locator=locator,
        base_start=base_start,
    )


def _looks_like_heading(text: str) -> bool:
    value = text.strip()
    if not value or len(value) > 40:
        return False
    if re.match(r"^第[一二三四五六七八九十0-9]+[章节条]", value):
        return True
    if value.endswith((":", "：")):
        return True
    if len(value) <= 25 and UPPERCASE_HEADING_RE.fullmatch(value):
        return True
    return False


def _build_sentence_aware_chunks(
    paragraph: str,
    *,
    source_type: str,
    locator: dict[str, Any],
    base_start: int,
) -> list[ChunkDescriptor]:
    sentences = _split_sentence_spans(paragraph)
    if len(sentences) <= 1:
        return _build_sliding_window_chunks(
            paragraph,
            source_type=source_type,
            locator=locator,
            base_start=base_start,
        )
    if any((end - start) > MAX_CHUNK_CHARS for _, start, end in sentences):
        return _build_sliding_window_chunks(
            paragraph,
            source_type=source_type,
            locator=locator,
            base_start=base_start,
        )

    chunks: list[ChunkDescriptor] = []
    cursor = 0
    while cursor < len(sentences):
        start_cursor = cursor
        chunk_start = sentences[cursor][1]
        chunk_end = sentences[cursor][2]
        while cursor < len(sentences):
            proposed_end = sentences[cursor][2]
            proposed_length = proposed_end - chunk_start
            if proposed_length > MAX_CHUNK_CHARS and cursor > start_cursor:
                break
            chunk_end = proposed_end
            cursor += 1
            if proposed_length >= TARGET_CHUNK_CHARS:
                break

        descriptor = _make_chunk_descriptor(
            text=paragraph[chunk_start:chunk_end],
            source_type=source_type,
            locator={
                **locator,
                "sentence_start": start_cursor,
                "sentence_end": max(cursor - 1, start_cursor),
            },
            char_start=base_start + chunk_start,
            char_end=base_start + chunk_end,
        )
        if descriptor is not None:
            chunks.append(descriptor)

        if cursor >= len(sentences):
            break
        cursor = max(_rewind_sentence_cursor(sentences, cursor), start_cursor + 1)

    if chunks:
        return chunks
    return _build_sliding_window_chunks(
        paragraph,
        source_type=source_type,
        locator=locator,
        base_start=base_start,
    )


def _build_sliding_window_chunks(
    paragraph: str,
    *,
    source_type: str,
    locator: dict[str, Any],
    base_start: int,
) -> list[ChunkDescriptor]:
    chunks: list[ChunkDescriptor] = []
    window_start = 0
    step = max(MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS, 1)
    while window_start < len(paragraph):
        window_end = min(len(paragraph), window_start + MAX_CHUNK_CHARS)
        descriptor = _make_chunk_descriptor(
            text=paragraph[window_start:window_end],
            source_type=source_type,
            locator={
                **locator,
                "window_start": window_start,
                "window_end": window_end,
            },
            char_start=base_start + window_start,
            char_end=base_start + window_end,
        )
        if descriptor is not None:
            chunks.append(descriptor)
        if window_end >= len(paragraph):
            break
        window_start += step
    return chunks


def _split_sentence_spans(text: str) -> list[tuple[str, int, int]]:
    spans: list[tuple[str, int, int]] = []
    for match in SENTENCE_RE.finditer(text):
        raw = match.group(0)
        if not raw or not raw.strip():
            continue
        leading = len(raw) - len(raw.lstrip())
        trailing = len(raw.rstrip())
        start = match.start() + leading
        end = match.start() + trailing
        if end <= start:
            continue
        spans.append((text[start:end], start, end))
    return spans


def _split_paragraph_entries(text: str) -> list[tuple[int, str, int, int]]:
    normalized = text.replace("\r\n", "\n")
    if not normalized.strip():
        return []
    parts = [segment.strip() for segment in re.split(r"\n{2,}", normalized) if segment.strip()]
    if not parts:
        return []
    entries: list[tuple[int, str, int, int]] = []
    seek_pos = 0
    for index, part in enumerate(parts, start=1):
        start = normalized.find(part, seek_pos)
        if start < 0:
            start = seek_pos
        end = start + len(part)
        seek_pos = end
        entries.append((index, part, start, end))
    return entries


def _rewind_sentence_cursor(sentences: list[tuple[str, int, int]], cursor: int) -> int:
    overlap = 0
    probe = cursor - 1
    while probe >= 0 and overlap < CHUNK_OVERLAP_CHARS:
        overlap += len(sentences[probe][0])
        probe -= 1
    return max(probe + 1, 0)


def _make_chunk_descriptor(
    *,
    text: str,
    source_type: str,
    locator: dict[str, Any],
    char_start: int,
    char_end: int,
) -> ChunkDescriptor | None:
    normalized = text.strip()
    if not normalized:
        return None
    return ChunkDescriptor(
        text=normalized,
        source_type=source_type,
        source_locator=json.dumps(locator, ensure_ascii=False),
        char_start=char_start,
        char_end=char_end,
    )


def _is_low_signal_chunk(text: str, *, title: str = "") -> bool:
    compact = re.sub(r"\s+", "", text).strip().lower()
    if not compact:
        return True
    if compact.isdigit() and len(compact) <= 8:
        return True
    if len(compact) >= MIN_SIGNAL_TEXT_CHARS:
        return False
    if PLACEHOLDER_RE.fullmatch(compact):
        return True
    title_compact = re.sub(r"\s+", "", title).strip().lower()
    if title_compact and title_compact == compact and len(compact) <= 4:
        return True
    if title_compact.isdigit() and len(title_compact) <= 8:
        return True
    if title_compact and PLACEHOLDER_RE.fullmatch(title_compact):
        return True
    if len(set(compact)) <= 2 and len(compact) >= 4:
        return True
    if compact.startswith(("tmp", "test", "demo")) and len(compact) <= 16:
        return True
    return False


def _build_snippet(hit: dict[str, Any], source: dict[str, Any]) -> str:
    highlight = hit.get("highlight", {})
    for field in ("content_text", "attachment_contents", "attachment_names", "title"):
        snippets = highlight.get(field)
        if snippets:
            return str(snippets[0])
    content_text = str(source.get("content_text", "")).strip()
    if content_text:
        return content_text[:180]
    return str(source.get("title", ""))


def _expand_query_terms(query: str) -> list[str]:
    normalized = query.strip()
    if not normalized:
        return []
    lowered = normalized.lower()
    tokens = _tokenize_query(lowered)
    candidates = [normalized]
    seen = {normalized}
    for group in SYNONYM_GROUPS:
        lowered_group = {item.lower() for item in group}
        if lowered in lowered_group or any(token in lowered_group for token in tokens):
            for item in group:
                if item not in seen:
                    seen.add(item)
                    candidates.append(item)
    return candidates


def _suggest_from_alias(query: str) -> list[str]:
    lowered = query.strip().lower()
    if not lowered:
        return []
    suggestions: list[str] = []
    seen: set[str] = set()
    for group in SYNONYM_GROUPS:
        lowered_group = [item.lower() for item in group]
        if any(item.startswith(lowered) for item in lowered_group):
            for item in group:
                if item not in seen:
                    seen.add(item)
                    suggestions.append(item)
    return suggestions
