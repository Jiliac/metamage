# MetaMage — MTG Tournament Analysis

MetaMage is a toolkit to analyze Magic: The Gathering tournament data. It includes:
- MCP Server exposing read-only analysis tools over a SQLite tournament database
- Chat agents (CLI and Discord) that use those tools via an LLM
- SocialBot that replies to Bluesky mentions with MCP-backed answers and session links
- Web UI to browse chat sessions and tool results
- Visualization (R) scripts to generate meta overview plots
- Ingestion utilities to build the tournament.db

If you don’t have the database file, email me at: valentinmanes@outlook.fr and I can provide a prebuilt SQLite DB so you can get started quickly.

See docs/mtg_data_flow.mmd for a high-level diagram of where MetaMage fits in the MTG data landscape.

---

## Choose Your Quick Start

Prerequisites for Python components:
- Python 3.13+
- uv (https://docs.astral.sh/uv/)
- SQLite tournament DB at data/tournament.db (default) or set TOURNAMENT_DB_PATH

Install deps:
```bash
uv sync
```

- MCP Server (HTTP):
```bash
uv run -m src.mcp_server.server --http
```
Endpoint: http://127.0.0.1:9000/mcp (use --host/--port to customize). For Claude Desktop: uv run -m src.mcp_server.server --stdio

- List tools (sanity check):
```bash
uv run -m src.cli_chat.list_tool
```

- CLI Chat Agent (Claude by default):
```bash
uv run -m src.cli_chat.chat_agent --provider claude
```
Requires ANTHROPIC_API_KEY.

- Discord Bot (slash commands):
```bash
uv run -m src.cli_chat.discord_bot
```
Requires DISCORD_BOT_TOKEN and ANTHROPIC_API_KEY.

- SocialBot (Bluesky responder):
```bash
uv run -m src.socialbot.server
```
Requires BLUESKY_USERNAME/BLUESKY_PASSWORD and ANTHROPIC_API_KEY.

- Web UI (Next.js, browse sessions and tool calls):
```bash
cd ui && npm install && npm run dev
```
Requires DATABASE_URL (Prisma) and NEXT_PUBLIC_SITE_URL.

- Visualization (R plots):
```bash
MTG_FORMAT=Modern START_DATE=2025-08-01 END_DATE=2025-09-15 Rscript visualize/run.R
```
Uses TOURNAMENT_DB_PATH if the DB is not at data/tournament.db.

---

## Components at a Glance

- MCP Server — src/mcp_server
  - Read-only DB access (PRAGMA query_only=ON; tool-level SELECT/WITH-only gate)
  - Tools: list_formats, get_format_meta_changes, get_meta_report, get_archetype_overview, get_archetype_trends, get_archetype_winrate, get_matchup_winrate, get_card_presence, get_archetype_cards, get_tournament_results, get_sources, search_card, get_player, query_database
  - [Details](src/mcp_server/README.md)

- CLI Chat Agent + Discord Bot — src/cli_chat
  - LangGraph ReAct agent using MCP tools; logs sessions and tool results to an Ops DB
  - Providers: Claude (default), Opus, GPT-5 (if configured)
  - [Details](src/cli_chat/README.md)

- SocialBot — src/socialbot
  - Polls Bluesky notifications, triages, answers with MCP-backed summaries (<=300 chars), appends session link
  - Stores notifications, replies, and session linkage in Ops DB
  - [Details](src/socialbot/README.md)

- Web UI — ui/
  - Next.js app to browse sessions (/sessions), session details (/sessions/[id]), and shareable tool pages (/tool/[id])
  - [Details](ui/README.md)

- Visualization (R) — visualize/
  - R scripts to generate meta overview plots and CSV export (marav.csv)
  - [Details](visualize/README.md)

- Ingestion — src/ingest
  - Build/extend the tournament database from JSON inputs and external caches
  - [Details](src/ingest/README.md)

---

## Environment Variables (summary)

Database
- TOURNAMENT_DB_PATH — path to tournament.db (default: data/tournament.db)
- POSTGRES_URL — Ops DB for chat logs (preferred)
- OPS_DB_PATH or BRIDGE_DB_PATH — fallback Ops SQLite path (default: data/ops.db)

LLMs
- ANTHROPIC_API_KEY — required for CLI/Discord/SocialBot
- OPENAI_API_KEY — optional (provider=gpt5)

Discord
- DISCORD_BOT_TOKEN — required to run the Discord bot

Bluesky
- BLUESKY_USERNAME, BLUESKY_PASSWORD — account credentials
- SOCIALBOT_POLL_INTERVAL, SOCIALBOT_MAX_TO_PROCESS, SOCIALBOT_MAX_TURNS, SOCIALBOT_CONTEXT_MAX_CHARS, SOCIALBOT_TRIAGE, SOCIALBOT_FORCE_ANSWER — tuning knobs

UI
- NEXT_PUBLIC_SITE_URL — e.g., https://www.metamages.com
- DATABASE_URL — Prisma DB URL for UI (Ops DB with ChatSession/ToolCall/ToolResult)

Visualization (R)
- MTG_FORMAT, START_DATE, END_DATE, TOP_N, MATRIX_TOP_N, TOURNAMENT_DB_PATH

---

## Repository Map

- [src/mcp_server](src/mcp_server/README.md) — MCP Server
- [src/cli_chat](src/cli_chat/README.md) — CLI agent and Discord bot
- [src/socialbot](src/socialbot/README.md) — Bluesky responder
- [ui](ui/README.md) — Web UI
- [visualize](visualize/README.md) — R plotting and CSV exports
- [src/ingest](src/ingest/README.md) — Ingestion utilities
- src/models — SQLAlchemy models and DB helpers
- src/ops_model — Ops (chat logging) models for sessions, tool calls, social notifications
- docs/mtg_data_flow.mmd — Data flow diagram (open with a Mermaid viewer)

---

## Troubleshooting

- MCP server won’t start: ensure uv sync succeeded and TOURNAMENT_DB_PATH points to an existing DB file
- Tool pre-load failed: list_formats pre-load is best-effort; tools still work
- Discord bot: verify DISCORD_BOT_TOKEN and ANTHROPIC_API_KEY
- Bluesky auth: check username/password; tokens auto-refresh
- UI: ensure DATABASE_URL (Prisma) points at Ops DB and NEXT_PUBLIC_SITE_URL is set
- R: packages auto-install; ensure R is available and TOURNAMENT_DB_PATH is correct

---

## Contact

Questions or requests for a ready-to-use DB:
- valentinmanes@outlook.fr
