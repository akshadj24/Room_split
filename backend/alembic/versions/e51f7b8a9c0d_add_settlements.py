"""add settlements table

Revision ID: e51f7b8a9c0d
Revises: c49a8d5e12f0
Create Date: 2026-10-26 22:53:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e51f7b8a9c0d"
down_revision: str | None = "c49a8d5e12f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "settlements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("payer_id", sa.Integer(), nullable=False),
        sa.Column("receiver_id", sa.Integer(), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("idempotency_key", sa.String(length=100), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"]),
        sa.ForeignKeyConstraint(["payer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["receiver_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_settlements_household_id"), "settlements", ["household_id"], unique=False)
    op.create_index(op.f("ix_settlements_payer_id"), "settlements", ["payer_id"], unique=False)
    op.create_index(op.f("ix_settlements_receiver_id"), "settlements", ["receiver_id"], unique=False)
    op.create_index(op.f("ix_settlements_idempotency_key"), "settlements", ["idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_settlements_idempotency_key"), table_name="settlements")
    op.drop_index(op.f("ix_settlements_receiver_id"), table_name="settlements")
    op.drop_index(op.f("ix_settlements_payer_id"), table_name="settlements")
    op.drop_index(op.f("ix_settlements_household_id"), table_name="settlements")
    op.drop_table("settlements")
