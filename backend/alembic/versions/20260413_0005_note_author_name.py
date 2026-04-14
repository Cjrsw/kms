"""add note author_name

Revision ID: 20260413_0005
Revises: 20260407_0004
Create Date: 2026-04-13 10:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260413_0005"
down_revision = "20260407_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("author_name", sa.String(length=120), nullable=False, server_default="系统"),
    )
    op.alter_column("notes", "author_name", server_default=None)


def downgrade() -> None:
    op.drop_column("notes", "author_name")
