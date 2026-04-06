from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.user import RevokedToken


def _to_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def parse_jwt_exp(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        converted = value
    elif isinstance(value, (int, float)):
        converted = datetime.fromtimestamp(value, tz=UTC)
    else:
        return None
    return _to_utc(converted)


def revoke_token_jti(
    db: Session,
    *,
    jti: str,
    user_id: int | None,
    reason: str,
    expires_at: datetime | None,
) -> None:
    if not jti.strip():
        return
    existing = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
    if existing is not None:
        return
    revoked = RevokedToken(
        user_id=user_id,
        jti=jti.strip(),
        reason=reason[:100],
        expires_at=_to_utc(expires_at).replace(tzinfo=None) if expires_at else None,
    )
    db.add(revoked)
    db.commit()


def is_token_revoked(db: Session, *, jti: str) -> bool:
    if not jti.strip():
        return True
    now = datetime.now(UTC).replace(tzinfo=None)
    row = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
    if row is None:
        return False
    if row.expires_at is not None and row.expires_at <= now:
        db.delete(row)
        db.commit()
        return False
    return True
