from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from elasticsearch import Elasticsearch
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.content import Attachment, Note, NoteChunk, Repository
from app.models.user import User
from app.schemas.search import SearchResponse, SearchResultItem

settings = get_settings()
NOTES_INDEX = "kms_notes"
MATCH_FIELDS = ["title^3", "content_text", "attachment_names^2", "attachment_contents^2.2", "repository_name^1.5"]
SYNONYM_GROUPS: list[tuple[str, ...]] = [
    ("考勤", "出勤", "打卡", "kaoqin", "chuqin", "daka"),
    ("人力", "人力资源", "hr", "renli", "renshiziyuan"),
    ("研发", "技术", "rd", "yanf", "yanfa"),
    ("运营", "运维", "ops", "yunying", "yunwei"),
    ("制度", "规范", "rule", "guideline"),
]


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
                "author_name": {"type": "keyword"},
                "content_text": {"type": "text"},
                "chunk_index": {"type": "integer"},
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
        _upsert_note_document(db, note)


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

    _upsert_note_document(db, note)


def delete_note_document(note_id: int) -> None:
    ensure_notes_index()
    client = get_es_client()
    client.delete_by_query(index=NOTES_INDEX, body={"query": {"term": {"note_id": note_id}}}, refresh=True)


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
        expanded_terms = _expand_query_terms(normalized_query)
        query_block = {
            "bool": {
                "should": _build_should_queries(expanded_terms, normalized_query),
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
                "title": {},
                "content_text": {"fragment_size": 160, "number_of_fragments": 1},
                "attachment_names": {"fragment_size": 120, "number_of_fragments": 1},
                "attachment_contents": {"fragment_size": 160, "number_of_fragments": 1},
            }
        },
        aggs={
            "unique_notes": {
                "cardinality": {"field": "note_id", "precision_threshold": 40000},
            }
        },
    )

    unique_total = int((response.get("aggregations", {}).get("unique_notes", {}) or {}).get("value", 0))
    hits = response.get("hits", {}).get("hits", [])
    items = [
        SearchResultItem(
            note_id=int(hit.get("_source", {}).get("note_id", 0)),
            repository_slug=str(hit.get("_source", {}).get("repository_slug", "")),
            repository_name=str(hit.get("_source", {}).get("repository_name", "")),
            title=str(hit.get("_source", {}).get("title", "")),
            author_name=str(hit.get("_source", {}).get("author_name", "系统")),
            snippet=_build_snippet(hit, hit.get("_source", {})),
            clearance_level=int(hit.get("_source", {}).get("clearance_level", 1)),
            attachment_count=int(hit.get("_source", {}).get("attachment_count", 0)),
            score=float(hit.get("_score") or 0.0),
            updated_at=str(hit.get("_source", {}).get("updated_at", "")),
        )
        for hit in hits
        if hit.get("_source")
    ]

    return SearchResponse(total=unique_total, page=page, page_size=page_size, items=items)


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
        query={
            "bool": {
                "should": should,
                "minimum_should_match": 1,
                "filter": bool_filter,
            }
        },
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
        normalized_author = author_keyword.strip()
        query = query.filter(func.lower(Note.author_name).like(f"%{normalized_author.lower()}%"))
    if file_type == "note":
        query = query.filter(~Note.attachments.any())
    elif file_type in {"pdf", "docx"}:
        query = query.filter(Note.attachments.any(func.lower(Attachment.file_type) == file_type))
    rows = query.all()
    return [int(row[0]) for row in rows]


def _build_should_queries(expanded_terms: list[str], original_query: str) -> list[dict[str, Any]]:
    should_queries: list[dict[str, Any]] = []
    for term in expanded_terms:
        boost = 2.2 if term == original_query else 1.0
        should_queries.append(
            {
                "multi_match": {
                    "query": term,
                    "fields": MATCH_FIELDS,
                    "boost": boost,
                }
            }
        )
    return should_queries


def _build_sort(sort_by: str) -> list[Any]:
    if sort_by == "updated_desc":
        return [{"updated_at": "desc"}, "_score"]
    if sort_by == "updated_asc":
        return [{"updated_at": "asc"}, "_score"]
    return ["_score", {"updated_at": "desc"}]


def _split_text_into_chunks(text: str, chunk_size: int = 800, overlap: int = 80) -> list[str]:
    words = text.strip().split()
    if not words:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(len(words), start + chunk_size)
        chunk = " ".join(words[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end == len(words):
            break
        start = end - overlap
        if start < 0:
            start = 0
    return chunks


def _upsert_note_document(db: Session, note: Note) -> None:
    repository: Repository | None = note.repository
    if repository is None:
        return

    attachment_names = [attachment.file_name for attachment in note.attachments]
    attachment_contents = [
        attachment.extracted_content.extracted_text
        for attachment in note.attachments
        if attachment.extracted_content and attachment.extracted_content.extracted_text.strip()
    ]
    file_types = {attachment.file_type.lower() for attachment in note.attachments}
    has_attachment = len(note.attachments) > 0

    base_texts: list[str] = [note.content_text]
    base_texts.extend(attachment_contents)
    full_text = "\n".join(text.strip() for text in base_texts if text.strip())
    chunks = _split_text_into_chunks(full_text)

    client = get_es_client()
    client.delete_by_query(index=NOTES_INDEX, body={"query": {"term": {"note_id": note.id}}}, refresh=True)
    db.query(NoteChunk).filter(NoteChunk.note_id == note.id).delete()
    db.commit()

    if not chunks:
        chunks = [full_text] if full_text else []

    for idx, chunk_text in enumerate(chunks):
        es_id = f"note-{note.id}-chunk-{idx}"
        note_chunk = NoteChunk(note_id=note.id, chunk_index=idx, content_text=chunk_text, es_document_id=es_id)
        db.add(note_chunk)
        document = {
            "note_id": note.id,
            "chunk_index": idx,
            "repository_id": note.repository_id,
            "repository_slug": repository.slug,
            "repository_name": repository.name,
            "title": note.title,
            "author_name": (note.author_name or "").strip() or "系统",
            "content_text": chunk_text,
            "attachment_names": " ".join(attachment_names),
            "attachment_contents": "\n".join(attachment_contents),
            "clearance_level": note.min_clearance_level,
            "attachment_count": len(note.attachments),
            "has_attachment": has_attachment,
            "has_pdf": "pdf" in file_types,
            "has_docx": "docx" in file_types,
            "updated_at": note.updated_at.isoformat(),
        }
        client.index(index=NOTES_INDEX, id=es_id, document=document, refresh=False)
    db.commit()
    client.indices.refresh(index=NOTES_INDEX)


def _build_snippet(hit: dict[str, Any], source: dict[str, Any]) -> str:
    highlight = hit.get("highlight", {})
    for field in ("content_text", "attachment_contents", "attachment_names", "title"):
        snippets = highlight.get(field)
        if snippets:
            return str(snippets[0])

    content_text = str(source.get("content_text", "")).strip()
    if content_text:
        return content_text[:160]

    return str(source.get("title", ""))


def _expand_query_terms(query: str) -> list[str]:
    normalized = query.strip()
    if not normalized:
        return []

    lowered = normalized.lower()
    tokens = re.findall(r"[a-z0-9\u4e00-\u9fff]+", lowered)
    candidates: list[str] = [normalized]
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
    suggestions: list[str] = []
    seen: set[str] = set()
    if not lowered:
        return suggestions
    for group in SYNONYM_GROUPS:
        lowered_group = [item.lower() for item in group]
        if any(item.startswith(lowered) for item in lowered_group):
            for item in group:
                if item not in seen:
                    seen.add(item)
                    suggestions.append(item)
    return suggestions
