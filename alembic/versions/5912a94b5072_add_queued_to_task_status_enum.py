"""add_queued_to_task_status_enum

Revision ID: 5912a94b5072
Revises: c45cb9efa52a
Create Date: 2026-06-17 06:58:55.237135

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5912a94b5072'
down_revision: Union[str, None] = 'c45cb9efa52a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    try:
        op.execute("ALTER TYPE task_status_enum ADD VALUE 'QUEUED'")
        op.execute("COMMIT")
    except Exception as e:
        # If it already exists, or other error, log it and roll back the failed transaction
        print(f"Skipping ALTER TYPE (might already exist): {e}")
        op.execute("ROLLBACK")
    op.execute("UPDATE tasks SET status = 'QUEUED' WHERE status = 'NOT_STARTED'")


def downgrade() -> None:
    op.execute("UPDATE tasks SET status = 'NOT_STARTED' WHERE status = 'QUEUED'")

