from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import update
from sqlalchemy.orm import Session, selectinload

from app.models.content import Attachment, IngestionJob, Note
from app.services.ingestion import AttachmentExtractionError, extract_attachment_text_with_error, upsert_attachment_text
from app.services.note_indexing import INDEX_FAILED, INDEX_INDEXED, INDEX_INDEXING, INDEX_PENDING
from app.services.search import index_note
from app.services.storage import get_object_bytes, remove_object

logger = logging.getLogger(__name__)


def enqueue_attachment_ingestion(
    db: Session,
    *,
    note_id: int,
    attachment_id: int,
    old_object_key: str | None = None,
) -> IngestionJob:
    job = IngestionJob(note_id=note_id, status="pending", error_message="")
    db.add(job)
    db.execute(
        update(Note)
        .where(Note.id == note_id)
        .values(search_index_status=INDEX_PENDING, search_index_error="")
    )
    db.commit()
    db.refresh(job)

    try:
        from app.tasks.ingestion import ingest_attachment

        ingest_attachment.delay(job.id, attachment_id, old_object_key)
    except Exception as exc:
        _mark_failed(db, job.id, note_id, f"Unable to enqueue attachment ingestion: {exc}")
        raise

    return job


def run_attachment_ingestion_job(
    *,
    job_id: int,
    attachment_id: int,
    old_object_key: str | None = None,
    db: Session,
) -> dict[str, int | str]:
    job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
    if job is None:
        return {"job_id": job_id, "attachment_id": attachment_id, "status": "missing-job"}

    attachment = (
        db.query(Attachment)
        .options(selectinload(Attachment.extracted_content))
        .filter(Attachment.id == attachment_id)
        .first()
    )
    if attachment is None:
        return _handle_missing_attachment(db, job, attachment_id)

    note_id = attachment.note_id
    try:
        _mark_processing(db, job, note_id)
        object_bytes = get_object_bytes(attachment.object_key)
        if object_bytes is None:
            raise FileNotFoundError("Attachment object not found in storage.")

        extracted_text, extraction_error = extract_attachment_text_with_error(attachment.file_name, object_bytes)
        if extraction_error:
            raise AttachmentExtractionError(extraction_error)

        upsert_attachment_text(db, attachment, extracted_text)
        index_note(db, note_id)
        _mark_indexed(db, job, note_id)
        _remove_replaced_object(old_object_key)
        return {"job_id": job_id, "attachment_id": attachment_id, "status": "completed"}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        _mark_failed(db, job_id, note_id, str(exc)[:1000])
        _remove_replaced_object(old_object_key)
        return {"job_id": job_id, "attachment_id": attachment_id, "status": "failed"}


def _mark_processing(db: Session, job: IngestionJob, note_id: int) -> None:
    job.status = "processing"
    job.error_message = ""
    db.add(job)
    db.execute(
        update(Note)
        .where(Note.id == note_id)
        .values(search_index_status=INDEX_INDEXING, search_index_error="")
    )
    db.commit()


def _mark_indexed(db: Session, job: IngestionJob, note_id: int) -> None:
    job.status = "completed"
    job.error_message = ""
    db.add(job)
    db.execute(
        update(Note)
        .where(Note.id == note_id)
        .values(
            search_index_status=INDEX_INDEXED,
            search_index_error="",
            search_indexed_at=datetime.utcnow(),
        )
    )
    db.commit()


def _mark_failed(db: Session, job_id: int, note_id: int, message: str) -> None:
    job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
    if job is not None:
        _mark_job(db, job, "failed", message)
    db.execute(
        update(Note)
        .where(Note.id == note_id)
        .values(search_index_status=INDEX_FAILED, search_index_error=message)
    )
    db.commit()


def _mark_job(db: Session, job: IngestionJob, status: str, message: str) -> None:
    job.status = status
    job.error_message = message[:1000]
    db.add(job)
    db.commit()


def _handle_missing_attachment(
    db: Session,
    job: IngestionJob,
    attachment_id: int,
) -> dict[str, int | str]:
    note_id = job.note_id
    note_exists = db.query(Note.id).filter(Note.id == note_id).first() is not None
    if not note_exists:
        _mark_job(db, job, "completed", "Attachment and note no longer exist; ingestion skipped.")
        return {"job_id": job.id, "attachment_id": attachment_id, "status": "skipped-missing-note"}

    try:
        _mark_processing(db, job, note_id)
        index_note(db, note_id)
        _mark_indexed(db, job, note_id)
        return {"job_id": job.id, "attachment_id": attachment_id, "status": "skipped-missing-attachment"}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        _mark_failed(db, job.id, note_id, str(exc)[:1000])
        return {"job_id": job.id, "attachment_id": attachment_id, "status": "failed"}


def _remove_replaced_object(object_key: str | None) -> None:
    if not object_key:
        return
    try:
        remove_object(object_key)
    except Exception:  # noqa: BLE001
        logger.exception("Unable to remove replaced attachment object %s", object_key)
