# MetaMage — MTG Tournament Analysis (MCP Server + Discord Bot)

This repository provides two major pieces:
1) MCP Server + Chat clients (Discord bot and a local CLI) — the focus of this README.
2) Data model + ingestion pipeline — advanced/optional; used to build the SQLite database the server queries.

If you just want to run the MCP server and ask questions about the MTG tournament database via Discord or a CLI, you only need:
- A Python 3.13+ environment
- uv for package management
- The SQLite database file (tournament.db)

If you don’t have the database file, email me at: valentinmanes@outlook.fr and I can provide a prebuilt SQLite DB so you can get started quickly.

The ingestion pipeline and model are available in this repo for transparency and customization, but they are complex and depend on public sources that require non-trivial processing.

---

## Quick Start (MCP Server + Clients)

### 0) Prerequisites
- Python 3.13+
- uv (https://docs.astral.sh/uv/) for dependency management
- A SQLite database file at:
  - data/tournament.db (default), or
  - set env var TOURNAMENT_DB_PATH to point to your .db file.

Tip: If you need the DB, contact me at valentinmanes@outlook.fr.

### 1) Install dependencies
This project uses uv with pyproject.toml.

```bash
uv sync
```

### 2) Place the database
Put the SQLite file at data/tournament.db (recommended), or set:
- TOURNAMENT_DB_PATH=/absolute/path/to/your/tournament.db

The server is hardened read-only:
- SQLite PRAGMA query_only=ON per connection
- The SQL tool only accepts SELECT/WITH queries (no DDL/DML/PRAGMA/transactions)

### 3) Run the MCP server (HTTP)
The MCP server supports stdio and HTTP. The included clients use HTTP.

```bash
uv run -m src.mcp_server.server --http
```

- Defaults to http://127.0.0.1:9000/mcp
- Pass --host and --port to customize
- For Claude Desktop (stdio transport), run: uv run -m src.mcp_server.server --stdio

### 4) Try listing tools (optional sanity check)
```bash
uv run -m src.cli_chat.list_tool
```
You should see a list of available MCP tools.

---

## Using the Chat Clients

### Option A: Local CLI Chat Agent
Requirements:
- ANTHROPIC_API_KEY environment variable set

Run:
```bash
uv run -m src.cli_chat.chat_agent
```

Then type your questions (examples are shown in the CLI prompt).
- The agent uses the MCP tools to query the DB and formats structured answers.
- The system prompt guides it to produce concise, data-backed insights.

### Option B: Discord Bot (Slash Commands)
Requirements:
- DISCORD_BOT_TOKEN environment variable set to your bot token
- ANTHROPIC_API_KEY set
- The MCP server running over HTTP (see step 3)

Run:
```bash
uv run -m src.cli_chat.discord_bot
```

- Commands:
  - /mage query: Ask MetaMage about formats, winrates, matchups, cards, meta reports
  - /mageping: Health check

Tip: In Discord, keep messages under ~2000 chars; the bot truncates if needed.

---

## Configuration and Environment Variables

- TOURNAMENT_DB_PATH
  - Optional. Absolute path to tournament.db
  - If not set, the server uses data/tournament.db
- ANTHROPIC_API_KEY
  - Required for both CLI agent and Discord bot (uses Claude Sonnet)
- DISCORD_BOT_TOKEN
  - Required for running the Discord bot

---

## MCP Server Details

- Module: src/mcp_server/server.py
- Default HTTP endpoint: http://127.0.0.1:9000/mcp
- Transport: streamable_http (as used by the included clients)
- Read-only protections:
  - Engine is opened with SQLite read-only pragmas
  - SQL validator allows only a single SELECT/WITH statement (no semicolons, no PRAGMAs)

Exposed tools include (non-exhaustive):
- list_formats — List all supported formats with IDs and names.
- get_format_meta_changes — Show bans and set releases that affected a format.
- get_archetype_overview — Resolve an archetype name and show recent performance and key cards.
- get_archetype_trends — Weekly presence and winrate trend for an archetype over time.
- get_meta_report — Top archetypes in a window with presence and winrate.
- get_archetype_winrate — Wins/losses/draws and winrate for one archetype in a date range.
- get_matchup_winrate — Head-to-head winrate between two archetypes.
- get_card_presence — Most played cards in a format (optionally main or side).
- get_archetype_cards — Most played cards within a specific archetype.
- get_tournament_results — Recent winners and top 8 archetype breakdowns.
- get_sources — Recent tournament links to cite for a given window (format and optional archetype).
- search_card — Find a card by name (local DB + Scryfall details).
- get_player — Player profile with recent results and activity.
- query_database — Run read-only custom SELECT queries against the database.

A simple tool lister lives at:
- src/cli_chat/list_tool.py

---

## Project Layout (high level)

- src/mcp_server/… — MCP server and tools
- src/cli_chat/… — Local CLI agent, Discord bot, MCP client utilities
- src/models/… — SQLAlchemy models and DB utilities
- src/ingest/… — Ingestion utilities (advanced)
- scripts/… — Maintenance and migration helpers
- data/ — Database location (git-ignored), sample CSVs and config
- docs/ — Additional documentation

---

## Data Model + Ingestion (Advanced)

The ingestion and model code are available if you want to build or customize your own database:
- Schema defined in src/models and reflected in docs/schema.mmd
- Ingestion helpers under src/ingest and scripts/
- Alembic migrations under alembic/

However, producing a high-quality, comprehensive tournament DB involves consolidating multiple public sources and careful normalization. If you would like to evaluate the system without building the data pipeline yourself, email me at:
- valentinmanes@outlook.fr
I can share a ready-to-use SQLite tournament.db to get you started quickly.

If you still want to experiment:
- There’s an example ingest entry point at src/ingest/ingest_tournament_data.py
- You’ll need properly formatted JSON inputs (see docs/ for examples)
- Be mindful of performance and indexes when scaling

---

## Troubleshooting

- “Error connecting to MCP server”
  - Ensure the server is running: uv run -m src.mcp_server.server --http
  - Confirm the database file exists at data/tournament.db or TOURNAMENT_DB_PATH
- “Tool pre-load failed”
  - list_formats pre-load is best-effort; the agent still works if it fails
- Discord bot doesn’t start
  - Check DISCORD_BOT_TOKEN and ANTHROPIC_API_KEY are set
  - Verify network/port accessibility to 127.0.0.1:9000 for MCP HTTP

---

## Contact
Questions or requests for a ready-to-use DB:
- valentinmanes@outlook.fr
