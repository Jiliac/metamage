import asyncio
import logging
from typing import List, Tuple

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from ..cli_chat.mcp_client import create_mcp_client
from ..cli_chat.chat_logger import ChatLogger
from ..cli_chat.titler import Titler
from ..cli_chat.system_prompt import get_metamage_system_prompt

logger = logging.getLogger("socialbot.agent")


class AgentContainer:
    """Lazy-initialized container for the ReAct agent."""

    def __init__(self):
        self._agent = None
        self._lock = asyncio.Lock()

    async def get_agent(self):
        if self._agent is None:
            async with self._lock:
                if self._agent is None:
                    logger.info("Initializing MCP tools for SocialBot...")
                    tools, format_context = await create_mcp_client()

                    logger.info("Creating Claude Sonnet client for SocialBot...")
                    llm = ChatAnthropic(
                        model="claude-sonnet-4-20250514",
                        max_tokens=4096,
                    )

                    system_prompt = get_metamage_system_prompt() + format_context
                    logger.info("Creating ReAct agent for SocialBot...")
                    self._agent = create_react_agent(llm, tools, prompt=system_prompt)
                    logger.info("SocialBot Agent ready.")
        return self._agent


agent_container = AgentContainer()


async def run_agent_with_logging(
    messages: List[tuple], provider: str
) -> Tuple[str, str]:
    """
    Run the agent with streaming and log thoughts/tool calls/results.
    Returns (assistant_message, session_id).
    """
    chat_logger = ChatLogger()
    titler = Titler()

    session_id = chat_logger.create_session(provider)

    # Attempt to log the latest user input if present
    try:
        if (
            messages
            and isinstance(messages[-1], (list, tuple))
            and len(messages[-1]) >= 2
        ):
            chat_logger.log_user_message(session_id, messages[-1][1])
    except Exception:
        pass

    assistant_message = ""
    current_message_id = None

    agent = await agent_container.get_agent()

    async for event in agent.astream(
        {"messages": messages}, config={"recursion_limit": 50}
    ):
        if "agent" in event:
            agent_messages = event["agent"].get("messages", [])
            if agent_messages:
                latest_message = agent_messages[-1]
                if hasattr(latest_message, "content") and latest_message.content:
                    content_items = latest_message.content
                    text_parts = []
                    tool_calls = []

                    if isinstance(content_items, list):
                        for item in content_items:
                            if isinstance(item, dict) and "type" in item:
                                if item["type"] == "text":
                                    text_parts.append(item.get("text", str(item)))
                                elif item["type"] == "tool_use":
                                    tool_calls.append(item)
                    elif isinstance(content_items, str):
                        assistant_message = content_items

                    readable = " ".join(text_parts).strip()
                    if readable:
                        current_message_id = chat_logger.log_agent_thought(
                            session_id, readable
                        )
                        assistant_message = readable

                    for tc in tool_calls:
                        if not current_message_id:
                            current_message_id = chat_logger.log_agent_thought(
                                session_id, ""
                            )
                        chat_logger.log_tool_call(
                            current_message_id,
                            tc.get("name"),
                            tc.get("input"),
                            tc.get("id"),
                        )

        elif "tools" in event:
            tool_messages = event["tools"].get("messages", [])
            for tool_msg in tool_messages:
                tool_call_id_value = getattr(tool_msg, "tool_call_id", None)
                if tool_call_id_value is None and isinstance(tool_msg, dict):
                    tool_call_id_value = tool_msg.get("tool_call_id")
                if tool_call_id_value:
                    tool_call_id = chat_logger.find_tool_call_by_call_id(
                        tool_call_id_value
                    )
                    if tool_call_id:
                        content = getattr(tool_msg, "content", None)
                        if content is None and isinstance(tool_msg, dict):
                            content = tool_msg.get("content")
                        chat_logger.log_tool_result(
                            tool_call_id,
                            str(content),
                            success=True,
                        )

    if assistant_message:
        chat_logger.log_final_response(session_id, assistant_message)
        # Title the session and any query_database tool calls
        try:
            titler.set_titles(session_id, provider, messages[-1][1], assistant_message)
        except Exception:
            pass

    return assistant_message, session_id
