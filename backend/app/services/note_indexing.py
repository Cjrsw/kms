from __future__ import annotations

import logging
from datetime import datetime

from fastapi import BackgroundTasks
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.content import Note
from app.services.search import index_note

logger = logging.getLogger(__name__)

INDEX_PENDING = "pending"
INDEX_INDEXING = "indexing"
INDEX_INDEXED = "indexed"
INDEX_FAILED = "failed"


def enqueue_note_index(background_tasks: BackgroundTasks, db: Session, note_id: int) -> None:
    """Mark a note as waiting for indexing and run the heavy work after the response."""
    note = db.query(Note).filter(Note.id == note_id).first()
    if note is None:
        return
    db.execute(
        update(Note)
        .where(Note.id == note_id)
        .values(search_index_status=INDEX_PENDING, search_index_error="")
    )
    db.commit()
    background_tasks.add_task(run_note_index_job, note_id)


def run_note_index_job(note_id: int) -> None:
    db = SessionLocal()
    try:
        _mark_status(db, note_id, INDEX_INDEXING)
        index_note(db, note_id)
        _mark_status(db, note_id, INDEX_INDEXED, indexed_at=datetime.utcnow())
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unable to index note %s", note_id)
        db.rollback()
        _mark_status(db, note_id, INDEX_FAILED, error=str(exc)[:1000])
    finally:
        db.close()


def _mark_status(
    db: Session,
    note_id: int,
    status: str,
    *,
    error: str = "",
    indexed_at: datetime | None = None,
) -> None:
    note = db.query(Note).filter(Note.id == note_id).first()
    if note is None:
        return
    values: dict[str, object] = {
        "search_index_status": status,
        "search_index_error": error,
    }
    if indexed_at is not None:
        values["search_indexed_at"] = indexed_at
    db.execute(update(Note).where(Note.id == note_id).values(**values))
    db.commit()
