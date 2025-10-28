# CLI Chat Agent and Discord Bot

## Overview

- ReAct agent (LangGraph) using MCP tools to answer questions about tournament data
- Logs sessions, messages, tool calls, and tool results into the Ops DB

## Run the CLI agent

Requires `ANTHROPIC_API_KEY` (Claude). OpenAI optional for `provider=gpt5`.

```bash
uv run -m src.cli_chat.chat_agent --provider claude
```

## List available tools

```bash
uv run -m src.cli_chat.list_tool
```

## Discord bot

- Slash commands: `/mage` (query), `/mageping` (health)
- Requires `DISCORD_BOT_TOKEN` and `ANTHROPIC_API_KEY`

```bash
uv run -m src.cli_chat.discord_bot
```

## Logging and titles

- Ops DB is Postgres via `POSTGRES_URL` (preferred) or SQLite via `OPS_DB_PATH`/`BRIDGE_DB_PATH` (default: `data/ops.db`)
- Titler uses a small model to generate session titles and query titles/column names

If you don't have the `tournament.db`, email: `valentinmanes@outlook.fr` for a prebuilt SQLite DB.
