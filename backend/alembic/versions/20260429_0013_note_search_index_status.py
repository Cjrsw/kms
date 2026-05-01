"""add note search index status

Revision ID: 20260429_0013
Revises: 20260427_0012
Create Date: 2026-04-29 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260429_0013"
down_revision = "20260427_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    note_columns = {column["name"] for column in inspector.get_columns("notes")}

    if "search_index_status" not in note_columns:
        op.add_column(
            "notes",
            sa.Column("search_index_status", sa.String(length=20), nullable=False, server_default="indexed"),
        )
        op.alter_column("notes", "search_index_status", server_default=None)

    if "search_index_error" not in note_columns:
        op.add_column(
            "notes",
            sa.Column("search_index_error", sa.Text(), nullable=True),
        )

    if "search_indexed_at" not in note_columns:
        op.add_column("notes", sa.Column("search_indexed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    note_columns = {column["name"] for column in inspector.get_columns("notes")}

    if "search_indexed_at" in note_columns:
        op.drop_column("notes", "search_indexed_at")
    if "search_index_error" in note_columns:
        op.drop_column("notes", "search_index_error")
    if "search_index_status" in note_columns:
        op.drop_column("notes", "search_index_status")
