"""enable fuzzy search of player and archetype

Revision ID: 69dd28a23263
Revises: 1a604eff3d98
Create Date: 2025-08-17 15:42:23.413288

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '69dd28a23263'
down_revision: Union[str, Sequence[str], None] = '1a604eff3d98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add indexes to improve fuzzy search performance
    
    # Index for archetype name fuzzy search (case-insensitive LIKE queries)
    op.create_index('idx_archetype_name_fuzzy', 'archetypes', ['name'])
    
    # Index for player handle fuzzy search (case-insensitive LIKE queries)
    op.create_index('idx_player_handle_fuzzy', 'players', ['handle'])
    
    # The normalized_handle already has an index from the model definition
    # so we don't need to add another one


def downgrade() -> None:
    """Downgrade schema."""
    # Remove the fuzzy search indexes
    op.drop_index('idx_archetype_name_fuzzy', table_name='archetypes')
    op.drop_index('idx_player_handle_fuzzy', table_name='players')
