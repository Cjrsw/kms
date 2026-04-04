from __future__ import annotations

from datetime import datetime, timedelta
import re
from typing import Any

from elasticsearch import Elasticsearch
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.content import Attachment, Note, NoteChunk, Repository
from app.models.user import User
from app.schemas.search import SearchResultItem

settings = get_settings()
NOTES_INDEX = "kms_notes"
CHUNK_SIZE = 320
CHUNK_OVERLAP = 48
MIN_CHUNK_SIZE = 80
SPACE_RE = re.compile(r"\s+")
SUPPORTED_FILE_TYPES = {"note", "pdf", "docx"}
UPDATED_WITHIN_DAYS = {
    "1d": 1,
    "7d": 7,
    "30d": 30,
    "365d": 365,
}


def get_es_client() -> Elasticsearch:
    return Elasticsearch(settings.elasticsearch_url)


def ensure_notes_index() -> None:
    client = get_es_client()
    if client.indices.exists(index=NOTES_INDEX):
        mapping = client.indices.get_mapping(index=NOTES_INDEX)
        properties = mapping.get(NOTES_INDEX, {}).get("mappings", {}).get("properties", {})
        required_fields = {"es_document_id", "note_id", "chunk_index", "chunk_text", "file_types"}
        if required_fields.issubset(set(properties.keys())):
            return
        client.indices.delete(index=NOTES_INDEX)

    client.indices.create(
        index=NOTES_INDEX,
        mappings={
            "properties": {
                "es_document_id": {"type": "keyword"},
                "note_id": {"type": "integer"},
                "repository_id": {"type": "integer"},
                "repository_slug": {"type": "keyword"},
                "repository_name": {"type": "text"},
                "title": {"type": "text"},
                "chunk_index": {"type": "integer"},
                "chunk_text": {"type": "text"},
                "file_types": {"type": "keyword"},
                "attachment_names": {"type": "text"},
                "clearance_level": {"type": "integer"},
                "attachment_count": {"type": "integer"},
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
        )
        .order_by(Note.id.asc())
        .all()
    )
    for note in notes:
        _upsert_note_documents(db, note)


def rebuild_notes_index(db: Session) -> None:
    client = get_es_client()
    if client.indices.exists(index=NOTES_INDEX):
        client.indices.delete(index=NOTES_INDEX)
    db.query(NoteChunk).delete(synchronize_session=False)
    db.commit()
    sync_all_notes(db)


def index_note(db: Session, note_id: int) -> None:
    ensure_notes_index()
    note = (
        db.query(Note)
        .options(
            selectinload(Note.repository),
            selectinload(Note.attachments).selectinload(Attachment.extracted_content),
        )
        .filter(Note.id == note_id)
        .first()
    )
    if note is None:
        return

    _upsert_note_documents(db, note)


def delete_note_document(note_id: int) -> None:
    ensure_notes_index()
    client = get_es_client()
    client.delete_by_query(
        index=NOTES_INDEX,
        query={"term": {"note_id": note_id}},
        refresh=True,
        conflicts="proceed",
    )


def search_notes(
    db: Session,
    user: User,
    query: str,
    repository_slug: str | None = None,
    file_type: str | None = None,
    updated_within: str | None = None,
) -> list[SearchResultItem]:
    normalized_query = query.strip()
    if not normalized_query:
        return []

    ensure_notes_index()
    client = get_es_client()
    bool_filter: list[dict[str, Any]] = [{"range": {"clearance_level": {"lte": user.clearance_level}}}]
    if repository_slug:
        bool_filter.append({"term": {"repository_slug": repository_slug}})

    normalized_file_type = _normalize_file_type_filter(file_type)
    if normalized_file_type:
        bool_filter.append({"term": {"file_types": normalized_file_type}})

    updated_since = _build_updated_since(updated_within)
    if updated_since:
        bool_filter.append({"range": {"updated_at": {"gte": updated_since}}})

    response = client.search(
        index=NOTES_INDEX,
        size=20,
        query={
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": normalized_query,
                            "fields": ["title^3", "chunk_text^2.8", "attachment_names^1.8", "repository_name^1.2"],
                        }
                    }
                ],
                "filter": bool_filter,
            }
        },
        collapse={"field": "note_id"},
        sort=[{"_score": "desc"}, {"updated_at": "desc"}],
        highlight={
            "fields": {
                "chunk_text": {"fragment_size": 160, "number_of_fragments": 1},
                "attachment_names": {"fragment_size": 80, "number_of_fragments": 1},
                "title": {},
            }
        },
    )

    results: list[SearchResultItem] = []
    hits = response.get("hits", {}).get("hits", [])
    for hit in hits:
        source = hit.get("_source", {})
        results.append(
            SearchResultItem(
                note_id=int(source["note_id"]),
                repository_slug=source["repository_slug"],
                repository_name=source["repository_name"],
                title=source["title"],
                snippet=_build_snippet(hit, source),
                clearance_level=int(source["clearance_level"]),
                attachment_count=int(source["attachment_count"]),
                score=float(hit.get("_score") or 0.0),
                updated_at=source["updated_at"],
            )
        )

    return results


def _upsert_note_documents(db: Session, note: Note) -> None:
    repository: Repository | None = note.repository
    if repository is None:
        return

    attachment_names = [attachment.file_name for attachment in note.attachments]
    file_types = sorted({"note", *(attachment.file_type.lower() for attachment in note.attachments if attachment.file_type)})
    text_sources = [note.content_text.strip()]
    text_sources.extend(
        attachment.extracted_content.extracted_text.strip()
        for attachment in note.attachments
        if attachment.extracted_content and attachment.extracted_content.extracted_text.strip()
    )
    chunk_texts = _build_chunks("\n\n".join(source for source in text_sources if source))
    if not chunk_texts:
        chunk_texts = [note.title.strip() or "空白笔记"]

    delete_note_document(note.id)
    db.query(NoteChunk).filter(NoteChunk.note_id == note.id).delete(synchronize_session=False)

    chunk_rows: list[NoteChunk] = []
    es_documents: list[dict[str, Any]] = []
    for index, chunk_text in enumerate(chunk_texts):
        es_document_id = f"note-{note.id}-chunk-{index}"
        chunk_rows.append(
            NoteChunk(
                note_id=note.id,
                chunk_index=index,
                content_text=chunk_text,
                es_document_id=es_document_id,
            )
        )
        es_documents.append(
            {
                "es_document_id": es_document_id,
                "note_id": note.id,
                "repository_id": note.repository_id,
                "repository_slug": repository.slug,
                "repository_name": repository.name,
                "title": note.title,
                "chunk_index": index,
                "chunk_text": chunk_text,
                "file_types": file_types,
                "attachment_names": " ".join(attachment_names),
                "clearance_level": note.min_clearance_level,
                "attachment_count": len(note.attachments),
                "updated_at": note.updated_at.isoformat(),
            }
        )

    db.add_all(chunk_rows)
    db.commit()

    client = get_es_client()
    for document in es_documents:
        client.index(index=NOTES_INDEX, id=document["es_document_id"], document=document, refresh=True)


def _build_chunks(text: str) -> list[str]:
    normalized_text = text.strip()
    if not normalized_text:
        return []

    blocks = [_normalize_block(block) for block in re.split(r"\n{2,}", normalized_text) if _normalize_block(block)]
    if not blocks:
        blocks = [_normalize_block(normalized_text)]

    chunks: list[str] = []
    current = ""
    for block in blocks:
        if len(block) <= CHUNK_SIZE:
            candidate = block if not current else f"{current}\n\n{block}"
            if len(candidate) <= CHUNK_SIZE:
                current = candidate
                continue

            if current:
                chunks.append(current)
            current = block
            continue

        if current:
            chunks.append(current)
            current = ""

        chunks.extend(_split_long_block(block))

    if current:
        chunks.append(current)

    merged_chunks: list[str] = []
    for chunk in chunks:
        if merged_chunks and len(chunk) < MIN_CHUNK_SIZE:
            merged_chunks[-1] = f"{merged_chunks[-1]}\n{chunk}"
        else:
            merged_chunks.append(chunk)

    return merged_chunks


def _split_long_block(block: str) -> list[str]:
    segments: list[str] = []
    start = 0
    text_length = len(block)
    while start < text_length:
        end = min(start + CHUNK_SIZE, text_length)
        if end < text_length:
            break_at = block.rfind("。", start, end)
            if break_at == -1:
                break_at = block.rfind("；", start, end)
            if break_at == -1:
                break_at = block.rfind("，", start, end)
            if break_at != -1 and break_at + 1 - start >= MIN_CHUNK_SIZE:
                end = break_at + 1

        segment = block[start:end].strip()
        if segment:
            segments.append(segment)

        if end >= text_length:
            break
        start = max(end - CHUNK_OVERLAP, start + 1)

    return segments


def _normalize_block(text: str) -> str:
    return SPACE_RE.sub(" ", text).strip()


def _build_snippet(hit: dict[str, Any], source: dict[str, Any]) -> str:
    highlight = hit.get("highlight", {})
    for field in ("chunk_text", "attachment_names", "title"):
        snippets = highlight.get(field)
        if snippets:
            return str(snippets[0])

    chunk_text = str(source.get("chunk_text", "")).strip()
    if chunk_text:
        return chunk_text[:160]

    return str(source.get("title", ""))


def _normalize_file_type_filter(file_type: str | None) -> str | None:
    normalized = (file_type or "").strip().lower()
    if not normalized or normalized == "all":
        return None
    if normalized in SUPPORTED_FILE_TYPES:
        return normalized
    return None


def _build_updated_since(updated_within: str | None) -> str | None:
    normalized = (updated_within or "").strip().lower()
    days = UPDATED_WITHIN_DAYS.get(normalized)
    if not days:
        return None
    return (datetime.utcnow() - timedelta(days=days)).isoformat()
