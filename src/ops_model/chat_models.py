from sqlalchemy import Column, String, Text, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from .base import Base, uuid_pk, TimestampMixin


class ChatSession(Base, TimestampMixin):
    """Chat sessions for MTG tournament analysis conversations."""

    __tablename__ = "chat_sessions"

    id = uuid_pk()
    provider = Column(String(20), nullable=False)  # claude, xai, opus, gpt5

    # Relationships
    messages = relationship(
        "ChatMessage", back_populates="session", passive_deletes=True
    )

    def __repr__(self):
        return f"<ChatSession(id={self.id}, provider='{self.provider}')>"


class ChatMessage(Base, TimestampMixin):
    """Messages within a chat session (user, agent thoughts, final responses)."""

    __tablename__ = "chat_messages"

    id = uuid_pk()
    session_id = Column(
        String(36),
        ForeignKey(
            "chat_sessions.id", name="fk_chat_message_session", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    message_type = Column(
        String(20), nullable=False
    )  # user, agent_thought, agent_final
    content = Column(Text, nullable=False)
    sequence_order = Column(Integer, nullable=False, index=True)

    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    tool_calls = relationship(
        "ToolCall", back_populates="message", passive_deletes=True
    )

    def __repr__(self):
        return f"<ChatMessage(id={self.id}, type='{self.message_type}', seq={self.sequence_order})>"


class ToolCall(Base, TimestampMixin):
    """Tool calls made by the agent during conversation."""

    __tablename__ = "tool_calls"

    id = uuid_pk()
    message_id = Column(
        String(36),
        ForeignKey("chat_messages.id", name="fk_tool_call_message", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tool_name = Column(String(100), nullable=False, index=True)
    input_params = Column(JSONB, nullable=False)
    call_id = Column(
        String(100), nullable=False, index=True
    )  # Agent's internal call ID

    # Relationships
    message = relationship("ChatMessage", back_populates="tool_calls")
    tool_result = relationship(
        "ToolResult",
        back_populates="tool_call",
        uselist=False,
        passive_deletes=True,
    )

    def __repr__(self):
        return f"<ToolCall(id={self.id}, tool='{self.tool_name}', call_id='{self.call_id}')>"


class ToolResult(Base, TimestampMixin):
    """Results from tool executions."""

    __tablename__ = "tool_results"

    id = uuid_pk()
    tool_call_id = Column(
        String(36),
        ForeignKey("tool_calls.id", name="fk_tool_result_call", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # 1-to-1 relationship
        index=True,
    )
    result_content = Column(JSONB, nullable=False)
    success = Column(Boolean, nullable=False, default=True)
    error_message = Column(Text, nullable=True)

    # Relationships
    tool_call = relationship("ToolCall", back_populates="tool_result")

    def __repr__(self):
        return f"<ToolResult(id={self.id}, success={self.success})>"
