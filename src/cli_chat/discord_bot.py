#!/usr/bin/env python3
"""Discord bot to query MTG tournament data via MCP-powered ReAct agent.

Requirements:
- DISCORD_BOT_TOKEN env var set to your bot token
- ANTHROPIC_API_KEY env var set
- MCP server running (e.g., `uv run -m src.mcp_server.server --http`)
"""

import os
import asyncio
import logging

import discord
from discord import app_commands
from dotenv import load_dotenv

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from .mcp_client import create_mcp_client
from .system_prompt import get_metamage_system_prompt
from .chat_logger import ChatLogger
from .titler import Titler

# Load environment variables from .env file
load_dotenv()

# Configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mtg-discord-bot")


class AgentContainer:
    """Lazy-initialized container for the ReAct agent."""

    def __init__(self):
        self._agent = None
        self._lock = asyncio.Lock()

    async def get_agent(self):
        if self._agent is None:
            async with self._lock:
                if self._agent is None:
                    logger.info("Initializing MCP tools...")
                    tools, format_context = await create_mcp_client()

                    logger.info("Creating Claude Sonnet client...")
                    llm = ChatAnthropic(
                        model="claude-sonnet-4-20250514",
                        # temperature=0.1,
                        max_tokens=4096,
                    )

                    # Get system prompt with current date and format context
                    system_prompt = get_metamage_system_prompt() + format_context

                    logger.info("Creating ReAct agent...")
                    self._agent = create_react_agent(llm, tools, prompt=system_prompt)
                    logger.info("Agent ready.")
        return self._agent


agent_container = AgentContainer()


async def run_agent_with_logging(agent, messages, provider: str):
    """Run the agent with streaming to log thoughts, tool calls, and results."""
    logger = ChatLogger()
    titler = Titler()
    # Create a new session for each invocation
    session_id = logger.create_session(provider)
    # Log the latest user message
    try:
        if (
            messages
            and isinstance(messages[-1], (list, tuple))
            and len(messages[-1]) >= 2
        ):
            logger.log_user_message(session_id, messages[-1][1])
    except Exception:
        pass

    assistant_message = ""
    current_message_id = None

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
                        text_parts = [content_items]

                    readable = " ".join(text_parts).strip()
                    if readable:
                        current_message_id = logger.log_agent_thought(
                            session_id, readable
                        )
                        assistant_message = readable

                    for tc in tool_calls:
                        if not current_message_id:
                            current_message_id = logger.log_agent_thought(
                                session_id, ""
                            )
                        logger.log_tool_call(
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
                    tool_call_id = logger.find_tool_call_by_call_id(tool_call_id_value)
                    if tool_call_id:
                        content = getattr(tool_msg, "content", None)
                        if content is None and isinstance(tool_msg, dict):
                            content = tool_msg.get("content")
                        logger.log_tool_result(
                            tool_call_id,
                            str(content),
                            success=True,
                        )

    if assistant_message:
        logger.log_final_response(session_id, assistant_message)
        # Title the session and any query_database tool calls
        titler.set_titles(session_id, provider, messages[-1][1], assistant_message)

    return assistant_message


class MTGBot(discord.Client):
    def __init__(self):
        intents = (
            discord.Intents.default()
        )  # Slash commands do not need message content intent
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self) -> None:
        # Sync global commands on startup
        try:
            synced = await self.tree.sync()
            logger.info(
                f"Synced {len(synced)} slash commands: {[cmd.name for cmd in synced]}"
            )
        except Exception as e:
            logger.error(f"Failed to sync commands: {e}")


bot = MTGBot()


@bot.tree.command(name="mage", description="Ask MetaMage about MTG tournament data")
@app_commands.describe(query="Your question about tournaments, decks, or meta")
async def mage(interaction: discord.Interaction, query: str):
    await interaction.response.defer(thinking=True)

    # Validate required env vars
    if not os.getenv("ANTHROPIC_API_KEY"):
        await interaction.followup.send(
            "Server error: ANTHROPIC_API_KEY is not set.", ephemeral=True
        )
        return

    try:
        agent = await agent_container.get_agent()
        messages = [("user", query)]
        answer = await run_agent_with_logging(agent, messages, provider="claude")
        if not answer:
            answer = "I couldn't produce a response this time."

        # Echo the query + response (like ChatGPT/Claude)
        full_response = f"**Question:** {query}\n\n{answer}"

        # Discord message length safety
        max_len = 1900
        if len(full_response) > max_len:
            full_response = full_response[:max_len] + "\n… (truncated)"

        await interaction.followup.send(full_response)
    except Exception as e:
        logger.exception("Error handling /mtg query")
        await interaction.followup.send(
            f"Sorry, I hit an error processing that: {e}", ephemeral=True
        )


@bot.tree.command(name="mageping", description="Health check for MetaMage")
async def mageping(interaction: discord.Interaction):
    await interaction.response.send_message("MetaMage is alive! 🏓", ephemeral=True)


def main():
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token:
        logger.error("DISCORD_BOT_TOKEN environment variable is not set.")
        raise SystemExit(1)

    bot.run(token)


if __name__ == "__main__":
    main()
