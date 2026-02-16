"""widen tournaments source column for cardsrealm

Revision ID: ce8d1497fd5a
Revises: f8cce4bcce99
Create Date: 2026-02-16 02:29:27.948028

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ce8d1497fd5a"
down_revision: Union[str, Sequence[str], None] = "f8cce4bcce99"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("tournaments", schema=None) as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=sa.VARCHAR(length=5),
            type_=sa.VARCHAR(length=20),
            existing_nullable=False,
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("tournaments", schema=None) as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=sa.VARCHAR(length=20),
            type_=sa.VARCHAR(length=5),
            existing_nullable=False,
        )
