from app.celery_app import celery_app
from app.db.session import SessionLocal


@celery_app.task(name="app.tasks.ingest_attachment")
def ingest_attachment(
    job_id: int,
    attachment_id: int,
    old_object_key: str | None = None,
) -> dict[str, int | str]:
    from app.services.attachment_ingestion import run_attachment_ingestion_job

    db = SessionLocal()
    try:
        return run_attachment_ingestion_job(
            job_id=job_id,
            attachment_id=attachment_id,
            old_object_key=old_object_key,
            db=db,
        )
    finally:
        db.close()


@celery_app.task(name="app.tasks.ingest_note")
def ingest_note(note_id: int) -> dict[str, int | str]:
    from app.services.note_indexing import run_note_index_job

    run_note_index_job(note_id)
    return {
        "note_id": note_id,
        "status": "completed",
    }
