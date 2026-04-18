from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.ai import QaAuditLog
from app.models.user import User


def record_qa_audit(
    db: Session,
    *,
    user: User,
    question: str,
    repository_slug: str | None,
    model_id: int | None = None,
    model_name: str = "",
    status: str,
    error_code: str = "",
    error_category: str = "",
    hint: str = "",
    trace_id: str = "",
    latency_ms: int = 0,
    source_count: int = 0,
    recall_mode: str = "keyword",
) -> None:
    try:
        log = QaAuditLog(
            user_id=user.id,
            username=user.username,
            question=question[:4000],
            repository_slug=(repository_slug or "")[:80],
            model_id=model_id,
            model_name=model_name[:120],
            status=status[:20],
            error_code=error_code[:80],
            error_category=error_category[:80],
            hint=hint[:500],
            trace_id=trace_id[:64],
            latency_ms=max(latency_ms, 0),
            source_count=max(source_count, 0),
            recall_mode=recall_mode[:20] if recall_mode else "keyword",
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
