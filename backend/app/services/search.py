from __future__ import annotations

import json
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
from app.services.ai_models import ModelInvocationError, invoke_embedding, resolve_embedding_model
from app.services.vector_store import delete_points_by_note_id, search_similar_chunks, upsert_chunk_vectors

settings = get_settings()

NOTES_INDEX = "kms_notes"
MAX_CHUNK_CHARS = 900
SLIDE_WINDOW_CHARS = 700
SLIDE_OVERLAP = 180
DEFAULT_TOP_K = 8

SYNONYM_GROUPS: list[tuple[str, ...]] = [
    ("\u8003\u52e4", "\u51fa\u52e4", "\u6253\u5361", "kaoqin", "chuqin", "daka"),
    ("\u4eba\u529b", "\u4eba\u529b\u8d44\u6e90", "hr", "renli", "renshiziyuan"),
    ("\u7814\u53d1", "\u6280\u672f", "rd", "yanfa", "jishu"),
    ("\u8fd0\u7ef4", "\u8fd0\u8425", "ops", "yunwei", "yunying"),
    ("\u5236\u5ea6", "\u89c4\u8303", "rule", "guideline"),
]

TOKEN_RE = re.compile(r"[A-Za-z0-9]+|[\u4e00-\u9fff]{1,}")


@dataclass
class ChunkDescriptor:
    text: str
    source_type: str
    source_locator: str
    char_start: int
    char_end: int


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


def sync_all_notes(db: Session) -> None:
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
        _upsert_note_document(db, note, include_vector=False)


def rebuild_notes_index(db: Session) -> None:
    client = get_es_client()
    if client.indices.exists(index=NOTES_INDEX):
        client.indices.delete(index=NOTES_INDEX)
    sync_all_notes(db)


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
    client.delete_by_query(index=NOTES_INDEX, body={"query": {"term": {"note_id": note_id}}}, refresh=True)
    delete_points_by_note_id(note_id)


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
            }
        }
    else:
        query_block = {"bool": {"must": [{"match_all": {}}], "filter": bool_filter}}

    offset = (page - 1) * page_size
    response = client.search(
        index=NOTES_INDEX,
        from_=offset,
        size=page_size,
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
) -> tuple[list[SearchResultItem], str]:
    safe_top_k = max(1, top_k or DEFAULT_TOP_K)

    keyword_resp = search_notes(
        db=db,
        user=user,
        query=query,
        repository_slug=repository_slug,
        page=1,
        page_size=max(safe_top_k * 2, 10),
    )
    keyword_items = keyword_resp.items
    if not keyword_items:
        return [], "keyword"

    fused_score: dict[int, float] = {}
    fused_item: dict[int, SearchResultItem] = {}
    hit_modes: dict[int, set[str]] = {}
    for idx, item in enumerate(keyword_items):
        fused_score[item.note_id] = fused_score.get(item.note_id, 0.0) + 1.0 / (60 + idx + 1)
        fused_item[item.note_id] = item
        hit_modes.setdefault(item.note_id, set()).add("keyword")

    embedding_model = resolve_embedding_model(db)
    if embedding_model is None:
        final = _sort_fused_items(fused_score, fused_item, hit_modes, limit=safe_top_k)
        return final, "keyword"

    try:
        query_vector = invoke_embedding(embedding_model, text=query, trace_id="")
    except ModelInvocationError:
        final = _sort_fused_items(fused_score, fused_item, hit_modes, limit=safe_top_k)
        return final, "keyword"

    vector_hits = search_similar_chunks(
        vector=query_vector,
        max_clearance_level=user.clearance_level,
        repository_slug=repository_slug,
        limit=max(safe_top_k * 4, 12),
    )
    if not vector_hits:
        final = _sort_fused_items(fused_score, fused_item, hit_modes, limit=safe_top_k)
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
        note_id = payload.get("note_id")
        if not isinstance(note_id, int):
            continue
        fused_score[note_id] = fused_score.get(note_id, 0.0) + 1.0 / (60 + idx + 1)
        hit_modes.setdefault(note_id, set()).add("vector")
        if note_id not in fused_item:
            from_vector = _build_item_from_vector_payload(payload, extra_note_map.get(note_id))
            if from_vector:
                fused_item[note_id] = from_vector

    final = _sort_fused_items(fused_score, fused_item, hit_modes, limit=safe_top_k)
    has_vector = any(item.hit_mode in {"vector", "hybrid"} for item in final)
    return final, ("hybrid" if has_vector else "keyword")


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


def _build_item_from_vector_payload(payload: dict[str, Any], fallback: dict[str, Any] | None) -> SearchResultItem | None:
    note_id = payload.get("note_id")
    if not isinstance(note_id, int):
        return None
    repository_slug = str(payload.get("repository_slug") or (fallback or {}).get("repository_slug") or "")
    repository_name = str(payload.get("repository_name") or (fallback or {}).get("repository_name") or "")
    title = str(payload.get("title") or (fallback or {}).get("title") or f"Note #{note_id}")
    author_name = str(payload.get("author_name") or (fallback or {}).get("author_name") or "系统")
    clearance = int(payload.get("clearance_level") or (fallback or {}).get("clearance_level") or 1)
    updated_at = str(payload.get("updated_at") or (fallback or {}).get("updated_at") or "")
    attachment_count = int(payload.get("attachment_count") or (fallback or {}).get("attachment_count") or 0)
    chunk_text = str(payload.get("chunk_text") or "").strip()
    snippet = chunk_text[:180] if chunk_text else title
    return SearchResultItem(
        note_id=note_id,
        repository_slug=repository_slug,
        repository_name=repository_name,
        title=title,
        author_name=author_name,
        snippet=snippet,
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
        .filter(Note.id.in_(unique_ids), Note.min_clearance_level <= user.clearance_level)
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


def _sort_fused_items(
    score_map: dict[int, float],
    item_map: dict[int, SearchResultItem],
    hit_modes: dict[int, set[str]],
    *,
    limit: int,
) -> list[SearchResultItem]:
    ordered_ids = sorted(score_map.keys(), key=lambda note_id: score_map[note_id], reverse=True)[:limit]
    items: list[SearchResultItem] = []
    for note_id in ordered_ids:
        item = item_map.get(note_id)
        if item is None:
            continue
        modes = hit_modes.get(note_id, {"keyword"})
        if "keyword" in modes and "vector" in modes:
            item.hit_mode = "hybrid"
        elif "vector" in modes:
            item.hit_mode = "vector"
        else:
            item.hit_mode = "keyword"
        item.score = score_map.get(note_id, item.score)
        items.append(item)
    return items


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

    embedding_model = resolve_embedding_model(db) if include_vector else None
    if embedding_model is not None:
        vectors: list[list[float]] = []
        payloads: list[dict[str, Any]] = []
        valid_chunks: list[NoteChunk] = []
        for chunk_row in note_chunks:
            try:
                vector = invoke_embedding(embedding_model, text=chunk_row.content_text, trace_id="")
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
                    "chunk_text": chunk_row.content_text[:1200],
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
    paragraphs = [line.strip() for line in re.split(r"\n{2,}|\r\n\r\n", text) if line.strip()]
    if not paragraphs:
        paragraphs = [text]
    chunks: list[ChunkDescriptor] = []
    cursor = 0
    current_heading = ""
    for paragraph_index, paragraph in enumerate(paragraphs, start=1):
        if _looks_like_heading(paragraph):
            current_heading = paragraph
            cursor += len(paragraph) + 1
            continue
        scoped_text = f"{current_heading}\n{paragraph}".strip() if current_heading else paragraph
        locator = {
            "attachment_id": attachment_id,
            "file_name": file_name,
            "paragraph": paragraph_index,
            "heading": current_heading,
        }
        chunks.extend(
            _build_chunks_from_text(
                scoped_text,
                source_type="attachment_docx",
                locator_base=locator,
                global_offset=cursor,
            )
        )
        cursor += len(paragraph) + 1
    return chunks


def _build_chunks_from_text(
    text: str,
    *,
    source_type: str,
    locator_base: dict[str, Any],
    global_offset: int = 0,
) -> list[ChunkDescriptor]:
    paragraphs = [segment.strip() for segment in re.split(r"\n{2,}|\r\n\r\n", text) if segment.strip()]
    if not paragraphs:
        paragraphs = [text.strip()]
    chunks: list[ChunkDescriptor] = []
    seek_pos = 0
    for paragraph_index, paragraph in enumerate(paragraphs, start=1):
        if not paragraph:
            continue
        local_start = text.find(paragraph, seek_pos)
        if local_start < 0:
            local_start = seek_pos
        local_end = local_start + len(paragraph)
        seek_pos = local_end
        locator = dict(locator_base)
        locator["paragraph"] = paragraph_index

        if len(paragraph) <= MAX_CHUNK_CHARS:
            chunks.append(
                ChunkDescriptor(
                    text=paragraph,
                    source_type=source_type,
                    source_locator=json.dumps(locator, ensure_ascii=False),
                    char_start=global_offset + local_start,
                    char_end=global_offset + local_end,
                )
            )
            continue

        window_start = 0
        while window_start < len(paragraph):
            window_end = min(len(paragraph), window_start + MAX_CHUNK_CHARS)
            window_text = paragraph[window_start:window_end].strip()
            if window_text:
                locator_with_window = dict(locator)
                locator_with_window["window_start"] = window_start
                locator_with_window["window_end"] = window_end
                chunks.append(
                    ChunkDescriptor(
                        text=window_text,
                        source_type=source_type,
                        source_locator=json.dumps(locator_with_window, ensure_ascii=False),
                        char_start=global_offset + local_start + window_start,
                        char_end=global_offset + local_start + window_end,
                    )
                )
            if window_end >= len(paragraph):
                break
            window_start += max(SLIDE_WINDOW_CHARS - SLIDE_OVERLAP, 1)
    return chunks


def _looks_like_heading(text: str) -> bool:
    value = text.strip()
    if not value or len(value) > 40:
        return False
    if re.match(r"^第[一二三四五六七八九十0-9]+[章节条]", value):
        return True
    if value.endswith((":", "：")):
        return True
    if value.isupper() and len(value) <= 25:
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
