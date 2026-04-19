"""add repository cover image url

Revision ID: 20260419_0007
Revises: 20260414_0006
Create Date: 2026-04-19 20:55:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260419_0007"
down_revision = "20260414_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("repositories")}
    if "cover_image_url" not in columns:
        op.add_column(
            "repositories",
            sa.Column("cover_image_url", sa.String(length=500), nullable=False, server_default=""),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("repositories")}
    if "cover_image_url" in columns:
        op.drop_column("repositories", "cover_image_url")
