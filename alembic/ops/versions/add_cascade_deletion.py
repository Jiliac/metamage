"""add cascade deletion to chat tables

Revision ID: cascade_chat_deletion
Revises: 7d03c9db4d71
Create Date: 2025-08-30 13:45:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cascade_chat_deletion'
down_revision: Union[str, Sequence[str], None] = '7d03c9db4d71'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add CASCADE deletion to foreign key constraints."""
    
    # Drop and recreate chat_messages.session_id FK with CASCADE
    op.drop_constraint('fk_chat_message_session', 'chat_messages', type_='foreignkey')
    op.create_foreign_key(
        'fk_chat_message_session', 
        'chat_messages', 
        'chat_sessions', 
        ['session_id'], 
        ['id'], 
        ondelete='CASCADE'
    )
    
    # Drop and recreate tool_calls.message_id FK with CASCADE  
    op.drop_constraint('fk_tool_call_message', 'tool_calls', type_='foreignkey')
    op.create_foreign_key(
        'fk_tool_call_message',
        'tool_calls', 
        'chat_messages',
        ['message_id'], 
        ['id'], 
        ondelete='CASCADE'
    )
    
    # Drop and recreate tool_results.tool_call_id FK with CASCADE
    op.drop_constraint('fk_tool_result_call', 'tool_results', type_='foreignkey') 
    op.create_foreign_key(
        'fk_tool_result_call',
        'tool_results',
        'tool_calls', 
        ['tool_call_id'],
        ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    """Remove CASCADE deletion from foreign key constraints."""
    
    # Recreate without CASCADE
    op.drop_constraint('fk_tool_result_call', 'tool_results', type_='foreignkey')
    op.create_foreign_key('fk_tool_result_call', 'tool_results', 'tool_calls', ['tool_call_id'], ['id'])
    
    op.drop_constraint('fk_tool_call_message', 'tool_calls', type_='foreignkey')
    op.create_foreign_key('fk_tool_call_message', 'tool_calls', 'chat_messages', ['message_id'], ['id'])
    
    op.drop_constraint('fk_chat_message_session', 'chat_messages', type_='foreignkey')
    op.create_foreign_key('fk_chat_message_session', 'chat_messages', 'chat_sessions', ['session_id'], ['id'])