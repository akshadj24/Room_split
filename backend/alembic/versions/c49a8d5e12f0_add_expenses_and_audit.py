"""add expenses and audit tables

Revision ID: c49a8d5e12f0
Revises: b8566d96ed29
Create Date: 2026-10-26 22:45:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c49a8d5e12f0"
down_revision: str | None = "b8566d96ed29"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. categories table
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_categories_household_id"), "categories", ["household_id"], unique=False)

    # 2. expenses table
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("paid_by", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("expense_date", sa.Date(), server_default=sa.text("CURRENT_DATE"), nullable=False),
        sa.Column("split_type", sa.String(length=20), server_default="equal", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"]),
        sa.ForeignKeyConstraint(["paid_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_expenses_household_id"), "expenses", ["household_id"], unique=False)
    op.create_index(op.f("ix_expenses_paid_by"), "expenses", ["paid_by"], unique=False)

    # 3. expense_splits table
    op.create_table(
        "expense_splits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("expense_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("share_paise", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["expense_id"], ["expenses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_expense_splits_expense_id"), "expense_splits", ["expense_id"], unique=False)
    op.create_index(op.f("ix_expense_splits_user_id"), "expense_splits", ["user_id"], unique=False)

    # 4. audit_events table
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_events_actor_id"), "audit_events", ["actor_id"], unique=False)
    op.create_index(op.f("ix_audit_events_household_id"), "audit_events", ["household_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_events_household_id"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_actor_id"), table_name="audit_events")
    op.drop_table("audit_events")

    op.drop_index(op.f("ix_expense_splits_user_id"), table_name="expense_splits")
    op.drop_index(op.f("ix_expense_splits_expense_id"), table_name="expense_splits")
    op.drop_table("expense_splits")

    op.drop_index(op.f("ix_expenses_paid_by"), table_name="expenses")
    op.drop_index(op.f("ix_expenses_household_id"), table_name="expenses")
    op.drop_table("expenses")

    op.drop_index(op.f("ix_categories_household_id"), table_name="categories")
    op.drop_table("categories")
