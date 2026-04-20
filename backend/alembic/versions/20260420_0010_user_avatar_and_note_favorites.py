"""add user avatar and note favorites

Revision ID: 20260420_0010
Revises: 20260420_0009
Create Date: 2026-04-20 21:05:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260420_0010"
down_revision = "20260420_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "avatar_object_key" not in user_columns:
        op.add_column("users", sa.Column("avatar_object_key", sa.String(length=255), nullable=True))

    tables = set(inspector.get_table_names())
    if "note_favorites" not in tables:
        op.create_table(
            "note_favorites",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("note_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("note_id", "user_id", name="uq_note_favorite_note_user"),
        )
        op.create_index("ix_note_favorites_note_id", "note_favorites", ["note_id"], unique=False)
        op.create_index("ix_note_favorites_user_id", "note_favorites", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = set(inspector.get_table_names())
    if "note_favorites" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("note_favorites")}
        if "ix_note_favorites_user_id" in indexes:
            op.drop_index("ix_note_favorites_user_id", table_name="note_favorites")
        if "ix_note_favorites_note_id" in indexes:
            op.drop_index("ix_note_favorites_note_id", table_name="note_favorites")
        op.drop_table("note_favorites")

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "avatar_object_key" in user_columns:
        op.drop_column("users", "avatar_object_key")
