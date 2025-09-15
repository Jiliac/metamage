import asyncio
import logging
from typing import List, Tuple, Optional

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from ..cli_chat.mcp_client import create_mcp_client
from ..cli_chat.chat_logger import ChatLogger
from ..cli_chat.titler import Titler
from ..cli_chat.system_prompt import get_metamage_system_prompt

logger = logging.getLogger("socialbot.agent")

# Reduce verbosity of HTTP and MCP logs
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("mcp.client.streamable_http").setLevel(logging.WARNING)


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
    messages: List[tuple], provider: str, session_id: Optional[str] = None
) -> Tuple[str, str]:
    """
    Run the agent with streaming and log thoughts/tool calls/results.
    Returns (assistant_message, session_id).
    """
    logger.info(
        f"Starting agent run with provider={provider}, messages={len(messages)}"
    )

    try:
        chat_logger = ChatLogger(session_id=session_id)
        titler = Titler()
        logger.info("Created ChatLogger and Titler")

        if chat_logger.current_session_id:
            session_id = chat_logger.current_session_id
            logger.info(f"Continuing session: {session_id}")
        else:
            session_id = chat_logger.create_session(provider)
            logger.info(f"Created session: {session_id}")

        # Attempt to log the latest user input if present
        try:
            if (
                messages
                and isinstance(messages[-1], (list, tuple))
                and len(messages[-1]) >= 2
            ):
                logger.info(f"Logging user message: {messages[-1][1][:100]}...")
                chat_logger.log_user_message(session_id, messages[-1][1])
                logger.info("User message logged successfully")
            else:
                logger.warning(f"Invalid messages format: {messages}")
        except Exception as log_error:
            logger.exception(f"Failed to log user message: {log_error}")

        assistant_message = ""
        current_message_id = None

        logger.info("Getting agent...")
        agent = await agent_container.get_agent()
        logger.info("Agent obtained, starting stream...")
    except Exception as setup_error:
        logger.exception(f"Failed during agent setup: {setup_error}")
        raise

    try:
        event_count = 0
        async for event in agent.astream(
            {"messages": messages}, config={"recursion_limit": 50}
        ):
            event_count += 1
            logger.debug(f"Received event {event_count}: {list(event.keys())}")

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
                            logger.debug(f"Logging agent thought: {readable[:100]}...")
                            current_message_id = chat_logger.log_agent_thought(
                                session_id, readable
                            )
                            assistant_message = readable

                        for tc in tool_calls:
                            logger.debug(f"Processing tool call: {tc.get('name')}")
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
                logger.debug("Processing tools event")
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
                            logger.debug(
                                f"Logging tool result for {tool_call_id_value}"
                            )
                            chat_logger.log_tool_result(
                                tool_call_id,
                                str(content),
                                success=True,
                            )

        logger.info(f"Agent streaming completed with {event_count} events")

        if assistant_message:
            logger.info("Logging final response and setting title")
            chat_logger.log_final_response(session_id, assistant_message)
            # Title the session and any query_database tool calls
            try:
                titler.set_titles(
                    session_id, provider, messages[-1][1], assistant_message
                )
                logger.info("Title set successfully")
            except Exception as title_error:
                logger.exception(f"Failed to set title: {title_error}")
        else:
            logger.warning("No assistant message to log")

        logger.info(f"Agent run completed successfully, session: {session_id}")
        return assistant_message, session_id

    except Exception as stream_error:
        logger.exception(f"Error during agent streaming: {stream_error}")
        raise
