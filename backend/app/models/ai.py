from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AIModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="openai_compatible")
    capability: Mapped[str] = mapped_column(String(20), index=True)  # chat | embedding
    api_base_url: Mapped[str] = mapped_column(String(255))
    model_name: Mapped[str] = mapped_column(String(120))
    api_key_encrypted: Mapped[str] = mapped_column(Text)
    api_key_masked: Mapped[str] = mapped_column(String(64), default="")
    extra_headers_json: Mapped[str] = mapped_column(Text, default="{}")
    extra_body_json: Mapped[str] = mapped_column(Text, default="{}")
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30)
    description: Mapped[str] = mapped_column(String(500), default="")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user_preferences: Mapped[list["UserModelPreference"]] = relationship(back_populates="chat_model")
    qa_audit_logs: Mapped[list["QaAuditLog"]] = relationship(back_populates="model")


class UserModelPreference(Base):
    __tablename__ = "user_model_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    chat_model_id: Mapped[int | None] = mapped_column(ForeignKey("ai_models.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="model_preference")
    chat_model: Mapped["AIModel | None"] = relationship(back_populates="user_preferences")


class QaAuditLog(Base):
    __tablename__ = "qa_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    username: Mapped[str] = mapped_column(String(50), default="")
    question: Mapped[str] = mapped_column(Text, default="")
    repository_slug: Mapped[str] = mapped_column(String(80), default="")
    model_id: Mapped[int | None] = mapped_column(ForeignKey("ai_models.id", ondelete="SET NULL"), nullable=True, index=True)
    model_name: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(20), index=True)
    error_code: Mapped[str] = mapped_column(String(80), default="")
    error_category: Mapped[str] = mapped_column(String(80), default="")
    hint: Mapped[str] = mapped_column(String(500), default="")
    trace_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    recall_mode: Mapped[str] = mapped_column(String(20), default="keyword")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    user: Mapped["User | None"] = relationship(back_populates="qa_audit_logs")
    model: Mapped["AIModel | None"] = relationship(back_populates="qa_audit_logs")
