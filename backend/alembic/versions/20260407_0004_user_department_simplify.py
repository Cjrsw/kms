"""simplify role model and add departments/user profile fields

Revision ID: 20260407_0004
Revises: 20260406_0003
Create Date: 2026-04-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260407_0004"
down_revision = "20260406_0003"
branch_labels = None
depends_on = None


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("departments"):
        op.create_table(
            "departments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(length=50), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("parent_id", sa.Integer(), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
            sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        )
        op.create_index("ix_departments_code", "departments", ["code"], unique=True)
        op.create_index("ix_departments_name", "departments", ["name"], unique=True)

    role_columns = {column["name"] for column in inspector.get_columns("roles")}
    if "is_system" not in role_columns:
        op.add_column("roles", sa.Column("is_system", sa.Boolean(), server_default=sa.text("0"), nullable=False))

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "phone" not in user_columns:
        op.add_column("users", sa.Column("phone", sa.String(length=30), nullable=True))
    if "position" not in user_columns:
        op.add_column("users", sa.Column("position", sa.String(length=100), nullable=True))
    if "gender" not in user_columns:
        op.add_column("users", sa.Column("gender", sa.String(length=20), nullable=True))
    if "bio" not in user_columns:
        op.add_column("users", sa.Column("bio", sa.String(length=500), nullable=True))
    if "department_id" not in user_columns:
        op.add_column("users", sa.Column("department_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_users_department_id_departments",
            "users",
            "departments",
            ["department_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if "deactivated_at" not in user_columns:
        op.add_column("users", sa.Column("deactivated_at", sa.DateTime(), nullable=True))
    if "need_password_change" not in user_columns:
        op.add_column("users", sa.Column("need_password_change", sa.Boolean(), server_default=sa.text("0"), nullable=False))

    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(length=255),
        nullable=True,
    )

    conn = bind

    admin_role_id = conn.execute(sa.text("SELECT id FROM roles WHERE code='admin' LIMIT 1")).scalar()
    if admin_role_id is None:
        conn.execute(sa.text("INSERT INTO roles(code, name, is_system) VALUES ('admin', '管理员', 1)"))
        admin_role_id = conn.execute(sa.text("SELECT id FROM roles WHERE code='admin' LIMIT 1")).scalar()
    else:
        conn.execute(sa.text("UPDATE roles SET name='管理员', is_system=1 WHERE id=:id"), {"id": admin_role_id})

    employee_role_id = conn.execute(sa.text("SELECT id FROM roles WHERE code='employee' LIMIT 1")).scalar()
    if employee_role_id is None:
        conn.execute(sa.text("INSERT INTO roles(code, name, is_system) VALUES ('employee', '员工', 1)"))
        employee_role_id = conn.execute(sa.text("SELECT id FROM roles WHERE code='employee' LIMIT 1")).scalar()
    else:
        conn.execute(sa.text("UPDATE roles SET name='员工', is_system=1 WHERE id=:id"), {"id": employee_role_id})

    admin_user_id = conn.execute(sa.text("SELECT id FROM users WHERE username='admin' LIMIT 1")).scalar()
    if admin_user_id is not None and admin_role_id is not None:
        conn.execute(
            sa.text("DELETE FROM user_roles WHERE user_id=:user_id AND role_id<>:role_id"),
            {"user_id": admin_user_id, "role_id": admin_role_id},
        )
        conn.execute(
            sa.text(
                "INSERT INTO user_roles(user_id, role_id) "
                "SELECT :user_id, :role_id FROM DUAL "
                "WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=:user_id AND role_id=:role_id)"
            ),
            {"user_id": admin_user_id, "role_id": admin_role_id},
        )

    if employee_role_id is not None:
        if admin_user_id is not None:
            conn.execute(
                sa.text(
                    "INSERT INTO user_roles(user_id, role_id) "
                    "SELECT u.id, :role_id FROM users u "
                    "WHERE u.id <> :admin_user_id "
                    "AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_id=:role_id)"
                ),
                {"role_id": employee_role_id, "admin_user_id": admin_user_id},
            )
        else:
            conn.execute(
                sa.text(
                    "INSERT INTO user_roles(user_id, role_id) "
                    "SELECT u.id, :role_id FROM users u "
                    "WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_id=:role_id)"
                ),
                {"role_id": employee_role_id},
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_column(inspector, "users", "need_password_change"):
        op.drop_column("users", "need_password_change")
    if _has_column(inspector, "users", "deactivated_at"):
        op.drop_column("users", "deactivated_at")
    if _has_column(inspector, "users", "department_id"):
        op.drop_constraint("fk_users_department_id_departments", "users", type_="foreignkey")
        op.drop_column("users", "department_id")
    if _has_column(inspector, "users", "bio"):
        op.drop_column("users", "bio")
    if _has_column(inspector, "users", "gender"):
        op.drop_column("users", "gender")
    if _has_column(inspector, "users", "position"):
        op.drop_column("users", "position")
    if _has_column(inspector, "users", "phone"):
        op.drop_column("users", "phone")

    if _has_column(inspector, "roles", "is_system"):
        op.drop_column("roles", "is_system")

    if inspector.has_table("departments"):
        indexes = {index["name"] for index in inspector.get_indexes("departments")}
        if "ix_departments_name" in indexes:
            op.drop_index("ix_departments_name", table_name="departments")
        if "ix_departments_code" in indexes:
            op.drop_index("ix_departments_code", table_name="departments")
        op.drop_table("departments")

    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(length=255),
        nullable=False,
    )
