"""add ai model governance and hybrid recall metadata

Revision ID: 20260414_0006
Revises: 20260413_0005
Create Date: 2026-04-14 18:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260414_0006"
down_revision = "20260413_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "ai_models" not in table_names:
        op.create_table(
            "ai_models",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=80), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False, server_default="openai_compatible"),
            sa.Column("capability", sa.String(length=20), nullable=False),
            sa.Column("api_base_url", sa.String(length=255), nullable=False),
            sa.Column("model_name", sa.String(length=120), nullable=False),
            sa.Column("api_key_encrypted", sa.Text(), nullable=False),
            sa.Column("api_key_masked", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("extra_headers_json", sa.Text(), nullable=False),
            sa.Column("extra_body_json", sa.Text(), nullable=False),
            sa.Column("max_tokens", sa.Integer(), nullable=True),
            sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("description", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    ai_indexes = {idx["name"] for idx in inspector.get_indexes("ai_models")} if "ai_models" in set(inspector.get_table_names()) else set()
    if "ix_ai_models_name" not in ai_indexes:
        op.create_index("ix_ai_models_name", "ai_models", ["name"], unique=True)
    if "ix_ai_models_capability" not in ai_indexes:
        op.create_index("ix_ai_models_capability", "ai_models", ["capability"], unique=False)
    if "ix_ai_models_is_enabled" not in ai_indexes:
        op.create_index("ix_ai_models_is_enabled", "ai_models", ["is_enabled"], unique=False)

    if "user_model_preferences" not in set(inspector.get_table_names()):
        op.create_table(
            "user_model_preferences",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("chat_model_id", sa.Integer(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["chat_model_id"], ["ai_models.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    inspector = sa.inspect(bind)
    pref_indexes = {idx["name"] for idx in inspector.get_indexes("user_model_preferences")} if "user_model_preferences" in set(inspector.get_table_names()) else set()
    if "ix_user_model_preferences_user_id" not in pref_indexes:
        op.create_index("ix_user_model_preferences_user_id", "user_model_preferences", ["user_id"], unique=True)

    if "qa_audit_logs" not in set(inspector.get_table_names()):
        op.create_table(
            "qa_audit_logs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("username", sa.String(length=50), nullable=False, server_default=""),
            sa.Column("question", sa.Text(), nullable=False),
            sa.Column("repository_slug", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("model_id", sa.Integer(), nullable=True),
            sa.Column("model_name", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("error_code", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("error_category", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("hint", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("trace_id", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("source_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("recall_mode", sa.String(length=20), nullable=False, server_default="keyword"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["model_id"], ["ai_models.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
    inspector = sa.inspect(bind)
    qa_indexes = {idx["name"] for idx in inspector.get_indexes("qa_audit_logs")} if "qa_audit_logs" in set(inspector.get_table_names()) else set()
    if "ix_qa_audit_logs_user_id" not in qa_indexes:
        op.create_index("ix_qa_audit_logs_user_id", "qa_audit_logs", ["user_id"], unique=False)
    if "ix_qa_audit_logs_model_id" not in qa_indexes:
        op.create_index("ix_qa_audit_logs_model_id", "qa_audit_logs", ["model_id"], unique=False)
    if "ix_qa_audit_logs_status" not in qa_indexes:
        op.create_index("ix_qa_audit_logs_status", "qa_audit_logs", ["status"], unique=False)
    if "ix_qa_audit_logs_trace_id" not in qa_indexes:
        op.create_index("ix_qa_audit_logs_trace_id", "qa_audit_logs", ["trace_id"], unique=False)
    if "ix_qa_audit_logs_created_at" not in qa_indexes:
        op.create_index("ix_qa_audit_logs_created_at", "qa_audit_logs", ["created_at"], unique=False)

    inspector = sa.inspect(bind)
    note_chunk_columns = {col["name"] for col in inspector.get_columns("note_chunks")}
    if "source_type" not in note_chunk_columns:
        op.add_column("note_chunks", sa.Column("source_type", sa.String(length=40), nullable=False, server_default="note"))
    if "source_locator" not in note_chunk_columns:
        op.add_column("note_chunks", sa.Column("source_locator", sa.Text(), nullable=True))
    if "char_start" not in note_chunk_columns:
        op.add_column("note_chunks", sa.Column("char_start", sa.Integer(), nullable=False, server_default="0"))
    if "char_end" not in note_chunk_columns:
        op.add_column("note_chunks", sa.Column("char_end", sa.Integer(), nullable=False, server_default="0"))
    if "vector_point_id" not in note_chunk_columns:
        op.add_column("note_chunks", sa.Column("vector_point_id", sa.String(length=64), nullable=True))
    note_chunk_indexes = {idx["name"] for idx in inspector.get_indexes("note_chunks")}
    if "ix_note_chunks_vector_point_id" not in note_chunk_indexes:
        op.create_index("ix_note_chunks_vector_point_id", "note_chunks", ["vector_point_id"], unique=True)
    op.execute("UPDATE note_chunks SET source_locator = '{}' WHERE source_locator IS NULL")


def downgrade() -> None:
    op.drop_index("ix_note_chunks_vector_point_id", table_name="note_chunks")
    op.drop_column("note_chunks", "vector_point_id")
    op.drop_column("note_chunks", "char_end")
    op.drop_column("note_chunks", "char_start")
    op.drop_column("note_chunks", "source_locator")
    op.drop_column("note_chunks", "source_type")

    op.drop_index("ix_qa_audit_logs_created_at", table_name="qa_audit_logs")
    op.drop_index("ix_qa_audit_logs_trace_id", table_name="qa_audit_logs")
    op.drop_index("ix_qa_audit_logs_status", table_name="qa_audit_logs")
    op.drop_index("ix_qa_audit_logs_model_id", table_name="qa_audit_logs")
    op.drop_index("ix_qa_audit_logs_user_id", table_name="qa_audit_logs")
    op.drop_table("qa_audit_logs")

    op.drop_index("ix_user_model_preferences_user_id", table_name="user_model_preferences")
    op.drop_table("user_model_preferences")

    op.drop_index("ix_ai_models_is_enabled", table_name="ai_models")
    op.drop_index("ix_ai_models_capability", table_name="ai_models")
    op.drop_index("ix_ai_models_name", table_name="ai_models")
    op.drop_table("ai_models")
