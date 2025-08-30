"""Chat logging functionality for MTG tournament analysis conversations."""

import json
from typing import Dict, Any, Optional

from ..ops_model.base import get_ops_session_factory
from ..ops_model.chat_models import ChatSession, ChatMessage, ToolCall, ToolResult


class ChatLogger:
    """Handles logging of chat conversations to PostgreSQL database."""

    def __init__(self):
        self.SessionFactory = get_ops_session_factory()
        self.current_session_id = None
        self.sequence_counter = 0

    def create_session(self, provider: str) -> str:
        """Create a new chat session and return its ID."""
        session = self.SessionFactory()
        try:
            chat_session = ChatSession(provider=provider)
            session.add(chat_session)
            session.commit()

            self.current_session_id = chat_session.id
            self.sequence_counter = 0  # Reset sequence for new session

            print(f"🗂️  Created chat session: {self.current_session_id}")
            return chat_session.id

        except Exception as e:
            session.rollback()
            print(f"❌ Error creating chat session: {e}")
            raise
        finally:
            session.close()

    def log_user_message(self, session_id: str, content: str) -> str:
        """Log a user message and return its ID."""
        return self._log_message(session_id, "user", content)

    def log_agent_thought(self, session_id: str, content: str) -> str:
        """Log an agent thought and return its ID."""
        return self._log_message(session_id, "agent_thought", content)

    def log_final_response(self, session_id: str, content: str) -> str:
        """Log the final agent response and return its ID."""
        return self._log_message(session_id, "agent_final", content)

    def _log_message(self, session_id: str, message_type: str, content: str) -> str:
        """Internal method to log any type of message."""
        session = self.SessionFactory()
        try:
            self.sequence_counter += 1

            message = ChatMessage(
                session_id=session_id,
                message_type=message_type,
                content=content,
                sequence_order=self.sequence_counter,
            )
            session.add(message)
            session.commit()

            print(f"📝 Logged {message_type}: seq={self.sequence_counter}")
            return message.id

        except Exception as e:
            session.rollback()
            print(f"❌ Error logging {message_type}: {e}")
            raise
        finally:
            session.close()

    def log_tool_call(
        self,
        message_id: str,
        tool_name: str,
        input_params: Dict[str, Any],
        call_id: str,
    ) -> str:
        """Log a tool call and return its ID."""
        session = self.SessionFactory()
        try:
            tool_call = ToolCall(
                message_id=message_id,
                tool_name=tool_name,
                input_params=input_params,
                call_id=call_id,
            )
            session.add(tool_call)
            session.commit()

            print(f"🔧 Logged tool call: {tool_name} (call_id: {call_id})")
            return tool_call.id

        except Exception as e:
            session.rollback()
            print(f"❌ Error logging tool call: {e}")
            raise
        finally:
            session.close()

    def log_tool_result(
        self,
        tool_call_id: str,
        result_content: Any,
        success: bool = True,
        error_message: Optional[str] = None,
    ) -> str:
        """Log a tool result and return its ID."""
        session = self.SessionFactory()
        try:
            # Ensure result_content is JSON serializable
            if isinstance(result_content, str):
                try:
                    # Try to parse as JSON first
                    result_json = json.loads(result_content)
                except json.JSONDecodeError:
                    # If not JSON, wrap in a simple structure
                    result_json = {"content": result_content}
            else:
                result_json = result_content

            tool_result = ToolResult(
                tool_call_id=tool_call_id,
                result_content=result_json,
                success=success,
                error_message=error_message,
            )
            session.add(tool_result)
            session.commit()

            status = "✅" if success else "❌"
            print(f"{status} Logged tool result: {len(str(result_content))} chars")
            return tool_result.id

        except Exception as e:
            session.rollback()
            print(f"❌ Error logging tool result: {e}")
            raise
        finally:
            session.close()

    def find_tool_call_by_call_id(self, call_id: str) -> Optional[str]:
        """Find a tool call ID by its call_id."""
        session = self.SessionFactory()
        try:
            tool_call = session.query(ToolCall).filter_by(call_id=call_id).first()
            return tool_call.id if tool_call else None
        except Exception as e:
            print(f"❌ Error finding tool call: {e}")
            return None
        finally:
            session.close()

    def get_session_stats(self, session_id: str) -> Dict[str, int]:
        """Get statistics for a chat session."""
        session = self.SessionFactory()
        try:
            stats = {}

            # Count messages by type
            for msg_type in ["user", "agent_thought", "agent_final"]:
                count = (
                    session.query(ChatMessage)
                    .filter_by(session_id=session_id, message_type=msg_type)
                    .count()
                )
                stats[f"{msg_type}_count"] = count

            # Count tool calls and results
            tool_calls_count = (
                session.query(ToolCall)
                .join(ChatMessage)
                .filter(ChatMessage.session_id == session_id)
                .count()
            )
            stats["tool_calls_count"] = tool_calls_count

            tool_results_count = (
                session.query(ToolResult)
                .join(ToolCall)
                .join(ChatMessage)
                .filter(ChatMessage.session_id == session_id)
                .count()
            )
            stats["tool_results_count"] = tool_results_count

            return stats

        except Exception as e:
            print(f"❌ Error getting session stats: {e}")
            return {}
        finally:
            session.close()
