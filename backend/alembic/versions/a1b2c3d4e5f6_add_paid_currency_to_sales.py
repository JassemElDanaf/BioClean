"""add paid_currency to sales

Revision ID: a1b2c3d4e5f6
Revises: ee244108e013
Create Date: 2026-09-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'ee244108e013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sales', sa.Column('paid_currency', sa.String(), nullable=False, server_default='USD'))
    op.alter_column('sales', 'paid_currency', server_default=None)


def downgrade() -> None:
    op.drop_column('sales', 'paid_currency')
