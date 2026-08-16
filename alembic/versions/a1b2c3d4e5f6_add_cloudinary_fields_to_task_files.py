"""add_cloudinary_fields_to_task_files

Revision ID: a1b2c3d4e5f6
Revises: e841e271fb65
Create Date: 2026-08-16 09:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'e841e271fb65'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('task_files', sa.Column('cloudinary_public_id', sa.String(length=255), nullable=True))
    op.add_column('task_files', sa.Column('cloudinary_url', sa.Text(), nullable=True))
    op.create_index(op.f('ix_task_files_cloudinary_public_id'), 'task_files', ['cloudinary_public_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_task_files_cloudinary_public_id'), table_name='task_files')
    op.drop_column('task_files', 'cloudinary_url')
    op.drop_column('task_files', 'cloudinary_public_id')
