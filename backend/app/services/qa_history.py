from __future__ import annotations

import json

from sqlalchemy.orm import Session, selectinload

from app.models.content import Note, Repository
from app.models.qa_history import QaConversation, QaMessage
from app.models.user import User
from app.schemas.qa import (
    QaConversationDetail,
    QaConversationListResponse,
    QaConversationMessageItem,
    QaConversationSummaryItem,
    QaSourceItem,
)

DEFAULT_CONVERSATION_TITLE = "新对话"


def list_user_conversations(db: Session, *, user: User) -> QaConversationListResponse:
    conversations = (
        db.query(QaConversation)
        .filter(QaConversation.user_id == user.id)
        .order_by(QaConversation.updated_at.desc(), QaConversation.id.desc())
        .all()
    )
    items = [_serialize_conversation_summary(conversation) for conversation in conversations]
    return QaConversationListResponse(total=len(items), items=items)


def get_user_conversation(db: Session, *, user: User, conversation_id: int) -> QaConversation | None:
    return (
        db.query(QaConversation)
        .options(selectinload(QaConversation.messages))
        .filter(QaConversation.id == conversation_id, QaConversation.user_id == user.id)
        .first()
    )


def serialize_conversation_detail(db: Session, *, conversation: QaConversation, user: User) -> QaConversationDetail:
    return QaConversationDetail(
        **_serialize_conversation_summary(conversation).model_dump(),
        messages=[_serialize_message(db, message=message, user=user) for message in conversation.messages],
    )


def create_conversation(
    db: Session,
    *,
    user: User,
    repository_slug: str | None,
    first_question: str,
) -> QaConversation:
    conversation = QaConversation(
        user_id=user.id,
        title=DEFAULT_CONVERSATION_TITLE,
        repository_slug=(repository_slug or "").strip(),
        last_question=_truncate_inline(first_question, 500),
        message_count=0,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def append_user_message(
    db: Session,
    *,
    conversation: QaConversation,
    user: User,
    question: str,
    repository_slug: str | None,
) -> QaMessage:
    message = QaMessage(
        conversation_id=conversation.id,
        user_id=user.id,
        role="user",
        content=question.strip(),
        status="success",
    )
    db.add(message)
    conversation.last_question = _truncate_inline(question, 500)
    conversation.repository_slug = (repository_slug or conversation.repository_slug or "").strip()
    conversation.message_count = int(conversation.message_count or 0) + 1
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    db.refresh(message)
    return message


def append_assistant_message(
    db: Session,
    *,
    conversation: QaConversation,
    content: str,
    status: str,
    trace_id: str,
    model_name: str,
    citation_status: str = "",
    error_code: str = "",
    error_category: str = "",
    source_count: int = 0,
    sources: list[QaSourceItem] | None = None,
) -> QaMessage:
    message = QaMessage(
        conversation_id=conversation.id,
        user_id=conversation.user_id,
        role="assistant",
        content=content,
        status=status,
        trace_id=trace_id,
        model_name=model_name,
        citation_status=citation_status,
        error_code=error_code,
        error_category=error_category,
        source_count=source_count,
        sources_json=json.dumps([source.model_dump() for source in (sources or [])], ensure_ascii=False),
    )
    db.add(message)
    conversation.message_count = int(conversation.message_count or 0) + 1
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    db.refresh(message)
    return message


def update_conversation_title(db: Session, *, conversation: QaConversation, title: str) -> QaConversation:
    cleaned_title = _normalize_title(title)
    if cleaned_title:
        conversation.title = cleaned_title
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
    return conversation


def fallback_conversation_title(question: str) -> str:
    normalized = " ".join(question.strip().split())
    if not normalized:
        return DEFAULT_CONVERSATION_TITLE
    return normalized[:18] if len(normalized) <= 18 else f"{normalized[:18].rstrip()}..."


def delete_conversation(db: Session, *, conversation: QaConversation) -> None:
    db.delete(conversation)
    db.commit()


def _serialize_conversation_summary(conversation: QaConversation) -> QaConversationSummaryItem:
    return QaConversationSummaryItem(
        id=conversation.id,
        title=conversation.title,
        repository_slug=conversation.repository_slug or None,
        last_question=conversation.last_question,
        message_count=conversation.message_count,
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat(),
    )


def _serialize_message(db: Session, *, message: QaMessage, user: User) -> QaConversationMessageItem:
    sources = _filter_existing_sources(db=db, user=user, sources=_parse_sources(message.sources_json))
    return QaConversationMessageItem(
        id=message.id,
        role=message.role,
        content=message.content,
        status=message.status,
        error_code=message.error_code or "",
        error_category=message.error_category or "",
        trace_id=message.trace_id or "",
        model_name=message.model_name or "",
        citation_status=message.citation_status or "",
        source_count=len(sources),
        sources=sources,
        created_at=message.created_at.isoformat(),
    )


def _parse_sources(raw_sources: str) -> list[QaSourceItem]:
    if not raw_sources:
        return []
    try:
        decoded = json.loads(raw_sources)
    except json.JSONDecodeError:
        return []
    if not isinstance(decoded, list):
        return []
    items: list[QaSourceItem] = []
    for item in decoded:
        if not isinstance(item, dict):
            continue
        try:
            items.append(QaSourceItem(**item))
        except Exception:
            continue
    return items


def _filter_existing_sources(db: Session, *, user: User, sources: list[QaSourceItem]) -> list[QaSourceItem]:
    note_ids = sorted({source.note_id for source in sources if source.note_id > 0})
    if not note_ids:
        return []
    notes = (
        db.query(Note)
        .join(Repository, Repository.id == Note.repository_id)
        .options(selectinload(Note.repository), selectinload(Note.attachments))
        .filter(
            Note.id.in_(note_ids),
            Note.min_clearance_level <= user.clearance_level,
            Repository.min_clearance_level <= user.clearance_level,
        )
        .all()
    )
    notes_by_id = {note.id: note for note in notes if note.repository is not None}
    filtered: list[QaSourceItem] = []
    for source in sources:
        note = notes_by_id.get(source.note_id)
        if note is None or note.repository is None:
            continue
        filtered.append(
            QaSourceItem(
                note_id=note.id,
                repository_slug=note.repository.slug,
                repository_name=note.repository.name,
                title=note.title,
                snippet=source.snippet,
                clearance_level=note.min_clearance_level,
                attachment_count=len(note.attachments),
                score=getattr(source, "score", None),
                updated_at=note.updated_at.isoformat(),
                hit_mode=getattr(source, "hit_mode", None),
            )
        )
    return filtered


def _truncate_inline(value: str, limit: int) -> str:
    normalized = " ".join(value.strip().split())
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip()


def _normalize_title(value: str) -> str:
    cleaned = value.strip().strip("\"'[]（）()：:，,。.;；")
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        return ""
    if len(cleaned) > 24:
        cleaned = cleaned[:24].rstrip()
    return cleaned
