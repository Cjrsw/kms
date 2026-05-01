"""Add note edit policy flag

Revision ID: 20260429_0014
Revises: 20260429_0013
Create Date: 2026-04-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260429_0014"
down_revision = "20260429_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("editable_by_clearance", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("notes", "editable_by_clearance", server_default=None)


def downgrade() -> None:
    op.drop_column("notes", "editable_by_clearance")
