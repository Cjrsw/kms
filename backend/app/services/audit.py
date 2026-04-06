from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.user import AuthAuditLog, User


def record_auth_audit(
    db: Session,
    *,
    event_type: str,
    status: str,
    request: Request | None = None,
    user: User | None = None,
    username: str | None = None,
    detail: str = "",
) -> None:
    try:
        ip_address = ""
        user_agent = ""
        if request is not None:
            ip_address = request.client.host if request.client else ""
            user_agent = request.headers.get("user-agent", "")[:255]

        log = AuthAuditLog(
            user_id=user.id if user else None,
            username=(username or (user.username if user else "")).strip()[:50],
            event_type=event_type,
            status=status,
            ip_address=ip_address,
            user_agent=user_agent,
            detail=detail[:500],
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
