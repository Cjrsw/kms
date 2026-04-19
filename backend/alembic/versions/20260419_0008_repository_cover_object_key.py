"""add repository cover object key

Revision ID: 20260419_0008
Revises: 20260419_0007
Create Date: 2026-04-19 21:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260419_0008"
down_revision = "20260419_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("repositories")}
    if "cover_image_object_key" not in columns:
        op.add_column(
            "repositories",
            sa.Column("cover_image_object_key", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("repositories")}
    if "cover_image_object_key" in columns:
        op.drop_column("repositories", "cover_image_object_key")
