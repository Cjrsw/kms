from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class QaConversation(Base):
    __tablename__ = "qa_conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="新对话")
    repository_slug: Mapped[str] = mapped_column(String(80), default="")
    last_question: Mapped[str] = mapped_column(String(500), default="")
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)

    user: Mapped["User"] = relationship(back_populates="qa_conversations")
    messages: Mapped[list["QaMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="QaMessage.id",
    )


class QaMessage(Base):
    __tablename__ = "qa_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("qa_conversations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(20), index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="success", index=True)
    error_code: Mapped[str] = mapped_column(String(80), default="")
    error_category: Mapped[str] = mapped_column(String(80), default="")
    trace_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    model_name: Mapped[str] = mapped_column(String(120), default="")
    citation_status: Mapped[str] = mapped_column(String(20), default="")
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    sources_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    conversation: Mapped["QaConversation"] = relationship(back_populates="messages")
    user: Mapped["User | None"] = relationship(back_populates="qa_messages")
