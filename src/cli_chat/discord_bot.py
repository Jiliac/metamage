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
                    tools = await create_mcp_client()

                    logger.info("Creating Claude Sonnet client...")
                    llm = ChatAnthropic(
                        model="claude-sonnet-4-20250514",
                        temperature=0.1,
                        max_tokens=4096,
                    )

                    logger.info("Creating ReAct agent...")
                    self._agent = create_react_agent(llm, tools)
                    logger.info("Agent ready.")
        return self._agent


agent_container = AgentContainer()


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
            logger.info(f"Synced {len(synced)} slash commands: {[cmd.name for cmd in synced]}")
        except Exception as e:
            logger.error(f"Failed to sync commands: {e}")


bot = MTGBot()


@bot.tree.command(name="mtgquery", description="Ask a one-shot MTG tournament data question")
@app_commands.describe(query="Your question (one sentence works great)")
async def mtgquery(interaction: discord.Interaction, query: str):
    await interaction.response.defer(thinking=True)

    # Validate required env vars
    if not os.getenv("ANTHROPIC_API_KEY"):
        await interaction.followup.send(
            "Server error: ANTHROPIC_API_KEY is not set.", ephemeral=True
        )
        return

    try:
        agent = await agent_container.get_agent()
        # One-shot, no history. Ask the agent directly.
        result = await agent.ainvoke({"messages": [("user", query)]})
        answer = result["messages"][-1].content

        # Discord message length safety
        max_len = 1900
        if isinstance(answer, str):
            text = answer
        else:
            text = str(answer)
        if len(text) > max_len:
            text = text[:max_len] + "\n… (truncated)"

        await interaction.followup.send(text)
    except Exception as e:
        logger.exception("Error handling /mtg query")
        await interaction.followup.send(
            f"Sorry, I hit an error processing that: {e}", ephemeral=True
        )


@bot.tree.command(name="mtgping", description="Health check for MTG bot")
async def mtgping(interaction: discord.Interaction):
    await interaction.response.send_message("MetaMage is alive! 🏓", ephemeral=True)


def main():
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token:
        logger.error("DISCORD_BOT_TOKEN environment variable is not set.")
        raise SystemExit(1)

    bot.run(token)


if __name__ == "__main__":
    main()
