from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.system import SystemSetting

CORS_ORIGINS_SETTING_KEY = "cors_allow_origins"


def get_cors_origins_setting(db: Session) -> list[str] | None:
    row = db.query(SystemSetting).filter(SystemSetting.key == CORS_ORIGINS_SETTING_KEY).first()
    if row is None:
        return None
    try:
        value = json.loads(row.value)
    except json.JSONDecodeError:
        return None
    if not isinstance(value, list):
        return None
    return [str(item).strip().rstrip("/") for item in value if str(item).strip()]


def set_cors_origins_setting(db: Session, origins: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for origin in origins:
        value = origin.strip().rstrip("/")
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    row = db.query(SystemSetting).filter(SystemSetting.key == CORS_ORIGINS_SETTING_KEY).first()
    value = json.dumps(normalized, ensure_ascii=False)
    if row is None:
        row = SystemSetting(key=CORS_ORIGINS_SETTING_KEY, value=value)
    else:
        row.value = value
    db.add(row)
    db.commit()
    return normalized
