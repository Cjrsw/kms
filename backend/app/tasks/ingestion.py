from app.celery_app import celery_app


@celery_app.task(name="app.tasks.ingest_note")
def ingest_note(note_id: int) -> dict[str, int | str]:
    return {
        "note_id": note_id,
        "status": "queued-placeholder",
    }
