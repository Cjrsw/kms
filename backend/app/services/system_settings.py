from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.system import SystemSetting

CORS_ORIGINS_SETTING_KEY = "cors_allow_origins"
CHAT_DEFAULT_MODEL_SETTING_KEY = "chat_default_model_id"
EMBEDDING_DEFAULT_MODEL_SETTING_KEY = "embedding_default_model_id"
QA_SYSTEM_PROMPT_SETTING_KEY = "qa_system_prompt"
HOME_CAROUSEL_SETTING_KEY = "home_carousel_slides"
HOME_ANNOUNCEMENT_SETTING_KEY = "home_announcement"
DEFAULT_HOME_ANNOUNCEMENT = {
    "title": "系统告示",
    "content": "欢迎使用智库 KMS。请优先通过知识仓库沉淀业务资料，并使用全文检索和知识问答定位答案。",
}

DEFAULT_HOME_CAROUSEL_SLIDES = [
    {
        "index": 1,
        "title": "KMS",
        "subtitle": "Knowledge Management System",
        "image_object_key": "",
    },
    {
        "index": 2,
        "title": "DATA",
        "subtitle": "Enterprise Knowledge Graph",
        "image_object_key": "",
    },
    {
        "index": 3,
        "title": "RAG",
        "subtitle": "Search And Question Answering",
        "image_object_key": "",
    },
]


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


def get_qa_system_prompt_setting(db: Session) -> tuple[str | None, datetime | None]:
    row = db.query(SystemSetting).filter(SystemSetting.key == QA_SYSTEM_PROMPT_SETTING_KEY).first()
    if row is None:
        return None, None
    value = row.value.strip()
    if not value:
        return None, row.updated_at
    return value, row.updated_at


def set_qa_system_prompt_setting(db: Session, prompt: str) -> tuple[str, datetime]:
    normalized = prompt.strip()
    row = db.query(SystemSetting).filter(SystemSetting.key == QA_SYSTEM_PROMPT_SETTING_KEY).first()
    if row is None:
        row = SystemSetting(key=QA_SYSTEM_PROMPT_SETTING_KEY, value=normalized)
    else:
        row.value = normalized
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.value, row.updated_at


def _normalize_home_carousel_slides(value: object) -> list[dict[str, object]]:
    raw_slides = value if isinstance(value, list) else []
    by_index: dict[int, dict[str, object]] = {}
    for item in raw_slides:
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("index", 0))
        except (TypeError, ValueError):
            continue
        if index < 1 or index > 3:
            continue
        by_index[index] = {
            "index": index,
            "title": str(item.get("title", "")).strip(),
            "subtitle": str(item.get("subtitle", "")).strip(),
            "image_object_key": str(item.get("image_object_key", "")).strip(),
        }

    normalized: list[dict[str, object]] = []
    for default_slide in DEFAULT_HOME_CAROUSEL_SLIDES:
        index = int(default_slide["index"])
        stored = by_index.get(index, {})
        normalized.append(
            {
                "index": index,
                "title": str(stored.get("title") or default_slide["title"]),
                "subtitle": str(stored.get("subtitle") or default_slide["subtitle"]),
                "image_object_key": str(stored.get("image_object_key") or ""),
            }
        )
    return normalized


def get_home_carousel_slides_setting(db: Session) -> tuple[list[dict[str, object]], datetime | None]:
    row = db.query(SystemSetting).filter(SystemSetting.key == HOME_CAROUSEL_SETTING_KEY).first()
    if row is None:
        return _normalize_home_carousel_slides(DEFAULT_HOME_CAROUSEL_SLIDES), None
    try:
        value = json.loads(row.value)
    except json.JSONDecodeError:
        value = []
    return _normalize_home_carousel_slides(value), row.updated_at


def set_home_carousel_slides_setting(db: Session, slides: list[dict[str, object]]) -> tuple[list[dict[str, object]], datetime]:
    normalized = _normalize_home_carousel_slides(slides)
    row = db.query(SystemSetting).filter(SystemSetting.key == HOME_CAROUSEL_SETTING_KEY).first()
    value = json.dumps(normalized, ensure_ascii=False)
    if row is None:
        row = SystemSetting(key=HOME_CAROUSEL_SETTING_KEY, value=value)
    else:
        row.value = value
    db.add(row)
    db.commit()
    db.refresh(row)
    return normalized, row.updated_at


def get_home_announcement_setting(db: Session) -> tuple[dict[str, str], datetime | None]:
    row = db.query(SystemSetting).filter(SystemSetting.key == HOME_ANNOUNCEMENT_SETTING_KEY).first()
    if row is None:
        return DEFAULT_HOME_ANNOUNCEMENT.copy(), None
    try:
        value = json.loads(row.value)
    except json.JSONDecodeError:
        value = {}
    if not isinstance(value, dict):
        value = {}
    title = str(value.get("title") or DEFAULT_HOME_ANNOUNCEMENT["title"]).strip()
    content = str(value.get("content") or DEFAULT_HOME_ANNOUNCEMENT["content"]).strip()
    return {"title": title, "content": content}, row.updated_at


def set_home_announcement_setting(db: Session, *, title: str, content: str) -> tuple[dict[str, str], datetime]:
    normalized = {
        "title": title.strip() or DEFAULT_HOME_ANNOUNCEMENT["title"],
        "content": content.strip() or DEFAULT_HOME_ANNOUNCEMENT["content"],
    }
    row = db.query(SystemSetting).filter(SystemSetting.key == HOME_ANNOUNCEMENT_SETTING_KEY).first()
    value = json.dumps(normalized, ensure_ascii=False)
    if row is None:
        row = SystemSetting(key=HOME_ANNOUNCEMENT_SETTING_KEY, value=value)
    else:
        row.value = value
    db.add(row)
    db.commit()
    db.refresh(row)
    return normalized, row.updated_at
