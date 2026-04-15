from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.system import SystemSetting

CORS_ORIGINS_SETTING_KEY = "cors_allow_origins"
CHAT_DEFAULT_MODEL_SETTING_KEY = "chat_default_model_id"
EMBEDDING_DEFAULT_MODEL_SETTING_KEY = "embedding_default_model_id"


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


def get_int_setting(db: Session, key: str) -> int | None:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row is None:
        return None
    value = row.value.strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def set_int_setting(db: Session, key: str, value: int | None) -> int | None:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    stored = "" if value is None else str(int(value))
    if row is None:
        row = SystemSetting(key=key, value=stored)
    else:
        row.value = stored
    db.add(row)
    db.commit()
    return value


def get_ai_default_model_ids(db: Session) -> tuple[int | None, int | None]:
    chat_default_id = get_int_setting(db, CHAT_DEFAULT_MODEL_SETTING_KEY)
    embedding_default_id = get_int_setting(db, EMBEDDING_DEFAULT_MODEL_SETTING_KEY)
    return chat_default_id, embedding_default_id


def set_ai_default_model_ids(
    db: Session,
    *,
    chat_default_model_id: int | None,
    embedding_default_model_id: int | None,
) -> tuple[int | None, int | None]:
    set_int_setting(db, CHAT_DEFAULT_MODEL_SETTING_KEY, chat_default_model_id)
    set_int_setting(db, EMBEDDING_DEFAULT_MODEL_SETTING_KEY, embedding_default_model_id)
    return chat_default_model_id, embedding_default_model_id
