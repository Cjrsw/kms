"""add qa conversation history

Revision ID: 20260421_0011
Revises: 20260420_0010
Create Date: 2026-04-21 14:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260421_0011"
down_revision = "20260420_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "qa_conversations" not in tables:
        op.create_table(
            "qa_conversations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False, server_default="新对话"),
            sa.Column("repository_slug", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("last_question", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_qa_conversations_user_id", "qa_conversations", ["user_id"], unique=False)
        op.create_index("ix_qa_conversations_updated_at", "qa_conversations", ["updated_at"], unique=False)

    if "qa_messages" not in tables:
        op.create_table(
            "qa_messages",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("conversation_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("role", sa.String(length=20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="success"),
            sa.Column("error_code", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("error_category", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("trace_id", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("model_name", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("citation_status", sa.String(length=20), nullable=False, server_default=""),
            sa.Column("source_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("sources_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["conversation_id"], ["qa_conversations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_qa_messages_conversation_id", "qa_messages", ["conversation_id"], unique=False)
        op.create_index("ix_qa_messages_user_id", "qa_messages", ["user_id"], unique=False)
        op.create_index("ix_qa_messages_role", "qa_messages", ["role"], unique=False)
        op.create_index("ix_qa_messages_status", "qa_messages", ["status"], unique=False)
        op.create_index("ix_qa_messages_trace_id", "qa_messages", ["trace_id"], unique=False)
        op.create_index("ix_qa_messages_created_at", "qa_messages", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "qa_messages" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("qa_messages")}
        for index_name in [
            "ix_qa_messages_created_at",
            "ix_qa_messages_trace_id",
            "ix_qa_messages_status",
            "ix_qa_messages_role",
            "ix_qa_messages_user_id",
            "ix_qa_messages_conversation_id",
        ]:
            if index_name in indexes:
                op.drop_index(index_name, table_name="qa_messages")
        op.drop_table("qa_messages")

    if "qa_conversations" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("qa_conversations")}
        for index_name in [
            "ix_qa_conversations_updated_at",
            "ix_qa_conversations_user_id",
        ]:
            if index_name in indexes:
                op.drop_index(index_name, table_name="qa_conversations")
        op.drop_table("qa_conversations")
