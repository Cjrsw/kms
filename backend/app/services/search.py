from __future__ import annotations

from typing import Any

from elasticsearch import Elasticsearch
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.content import Attachment, Note, Repository
from app.models.user import User
from app.schemas.search import SearchResultItem

settings = get_settings()
NOTES_INDEX = "kms_notes"


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
                "content_text": {"type": "text"},
                "attachment_names": {"type": "text"},
                "attachment_contents": {"type": "text"},
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
        _upsert_note_document(note)


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
        )
        .filter(Note.id == note_id)
        .first()
    )
    if note is None:
        return

    _upsert_note_document(note)


def delete_note_document(note_id: int) -> None:
    ensure_notes_index()
    client = get_es_client()
    document_id = f"note-{note_id}"
    if client.exists(index=NOTES_INDEX, id=document_id):
        client.delete(index=NOTES_INDEX, id=document_id, refresh=True)


def search_notes(
    db: Session,
    user: User,
    query: str,
    repository_slug: str | None = None,
) -> list[SearchResultItem]:
    normalized_query = query.strip()
    if not normalized_query:
        return []

    ensure_notes_index()
    client = get_es_client()
    bool_filter: list[dict[str, Any]] = [{"range": {"clearance_level": {"lte": user.clearance_level}}}]
    if repository_slug:
        bool_filter.append({"term": {"repository_slug": repository_slug}})

    response = client.search(
        index=NOTES_INDEX,
        size=20,
        query={
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": normalized_query,
                            "fields": ["title^3", "content_text", "attachment_names^2", "attachment_contents^2.2", "repository_name^1.5"],
                        }
                    }
                ],
                "filter": bool_filter,
            }
        },
        highlight={
            "fields": {
                "title": {},
                "content_text": {"fragment_size": 120, "number_of_fragments": 1},
                "attachment_names": {"fragment_size": 80, "number_of_fragments": 1},
                "attachment_contents": {"fragment_size": 120, "number_of_fragments": 1},
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


def _upsert_note_document(note: Note) -> None:
    repository: Repository | None = note.repository
    if repository is None:
        return

    attachment_names = [attachment.file_name for attachment in note.attachments]
    attachment_contents = [
        attachment.extracted_content.extracted_text
        for attachment in note.attachments
        if attachment.extracted_content and attachment.extracted_content.extracted_text.strip()
    ]
    document = {
        "note_id": note.id,
        "repository_id": note.repository_id,
        "repository_slug": repository.slug,
        "repository_name": repository.name,
        "title": note.title,
        "content_text": note.content_text,
        "attachment_names": " ".join(attachment_names),
        "attachment_contents": "\n".join(attachment_contents),
        "clearance_level": note.min_clearance_level,
        "attachment_count": len(note.attachments),
        "updated_at": note.updated_at.isoformat(),
    }
    get_es_client().index(index=NOTES_INDEX, id=f"note-{note.id}", document=document, refresh=True)


def _build_snippet(hit: dict[str, Any], source: dict[str, Any]) -> str:
    highlight = hit.get("highlight", {})
    for field in ("content_text", "attachment_contents", "attachment_names", "title"):
        snippets = highlight.get(field)
        if snippets:
            return str(snippets[0])

    content_text = str(source.get("content_text", "")).strip()
    if content_text:
        return content_text[:120]

    return str(source.get("title", ""))
