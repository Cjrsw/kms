"""auth hardening and system settings

Revision ID: 20260406_0002
Revises: 20260406_0001
Create Date: 2026-04-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260406_0002"
down_revision = "20260406_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "failed_login_attempts" not in user_columns:
        op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(), server_default="0", nullable=False))
    if "locked_until" not in user_columns:
        op.add_column("users", sa.Column("locked_until", sa.DateTime(), nullable=True))
    if "token_version" not in user_columns:
        op.add_column("users", sa.Column("token_version", sa.Integer(), server_default="0", nullable=False))

    if not inspector.has_table("auth_audit_logs"):
        op.create_table(
            "auth_audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("username", sa.String(length=50), server_default="", nullable=False),
            sa.Column("event_type", sa.String(length=50), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("ip_address", sa.String(length=64), server_default="", nullable=False),
            sa.Column("user_agent", sa.String(length=255), server_default="", nullable=False),
            sa.Column("detail", sa.String(length=500), server_default="", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        )

    if not inspector.has_table("system_settings"):
        op.create_table(
            "system_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("key", sa.String(length=100), nullable=False),
            sa.Column("value", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        )

    system_settings_indexes = {index["name"] for index in inspector.get_indexes("system_settings")}
    if "ix_system_settings_key" not in system_settings_indexes:
        op.create_index("ix_system_settings_key", "system_settings", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_system_settings_key", table_name="system_settings")
    op.drop_table("system_settings")
    op.drop_table("auth_audit_logs")
    op.drop_column("users", "token_version")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_attempts")
