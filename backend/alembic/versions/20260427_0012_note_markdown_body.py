"""add note markdown body

Revision ID: 20260427_0012
Revises: 20260421_0011
Create Date: 2026-04-27 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260427_0012"
down_revision = "20260421_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    note_columns = {column["name"] for column in inspector.get_columns("notes")}

    if "content_markdown" not in note_columns:
        op.add_column(
            "notes",
            sa.Column("content_markdown", sa.Text(), nullable=True),
        )
        op.execute("UPDATE notes SET content_markdown = COALESCE(content_text, '')")
        op.alter_column("notes", "content_markdown", existing_type=sa.Text(), nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    note_columns = {column["name"] for column in inspector.get_columns("notes")}

    if "content_markdown" in note_columns:
        op.drop_column("notes", "content_markdown")
