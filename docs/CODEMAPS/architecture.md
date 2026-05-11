<!-- Generated: 2026-05-11 | Files scanned: ~220 | Token estimate: ~750 -->

# MetaMage — Architecture

MTG tournament analysis toolkit. Tournament data → SQLite DB → MCP tools → chat/social/UI/R consumers.

## System Map

```
External MTG data (MTGODecklistCache + MTGOArchetypeParser JSON)
            │
            ▼
   src/ingest (Python)        ── builds ──▶  data/tournament.db  (SQLite, read-only at runtime)
                                              │
                                              ├──▶ src/mcp_server (FastMCP)          ── tools/resources ─▶  MCP clients
                                              │      │
                                              │      └──▶ src/analysis (compute_*)
                                              │
                                              └──▶ visualize/ (R, RSQLite)           ── plots ─▶  Results/*.pdf, marav.csv

   MCP clients (LLM agents reading tools):
     ├─ src/cli_chat/chat_agent      (terminal ReAct loop)
     ├─ src/cli_chat/discord_bot     (Discord slash cmds)
     └─ src/socialbot/server         (Bluesky/Twitter responder)

   All agents persist sessions/tool calls → Ops DB (Postgres preferred; SQLite fallback)
     └─ ui/  (Next.js 15)            reads Ops DB via Prisma → /sessions, /tool/[id]
```

## Service Boundaries

| Component           | Path                 | Runtime               | Reads                      | Writes                                   |
| ------------------- | -------------------- | --------------------- | -------------------------- | ---------------------------------------- |
| MCP Server          | `src/mcp_server`     | Python 3.13 / FastMCP | tournament.db (ro)         | — (archetype_alias tool is sole write)   |
| CLI / Discord agent | `src/cli_chat`       | Python / LangGraph    | MCP tools                  | Ops DB (ChatSession/Message/Tool\*)      |
| SocialBot           | `src/socialbot`      | Python asyncio        | MCP tools, Bluesky/Twitter | Ops DB (SocialNotification, ChatSession) |
| Ingestion           | `src/ingest`         | Python / SQLAlchemy   | external JSON, Scryfall    | tournament.db                            |
| Visualization       | `visualize/`         | R                     | tournament.db              | Results/\*.pdf, marav.csv                |
| Web UI              | `ui/`                | Next.js 15 / Prisma   | Ops DB                     | —                                        |
| Social adapters     | `src/social_clients` | Python httpx/tweepy   | Bluesky/Twitter APIs       | platform-side replies                    |

## Two Databases

- **tournament.db** (SQLite, read-only) — domain data. Models in `src/models/`, schema in `docs/schema.mmd`.
- **Ops DB** (Postgres prod / SQLite dev) — chat sessions, tool calls, social notifications. Models in `src/ops_model/`. UI Prisma schema mirrors `chat_models.py` at `ui/public/prisma/schema.prisma`.

## Read-only Hardening (MCP)

- SQLite opened `mode=ro`; `PRAGMA query_only=ON` per connection (`src/mcp_server/utils.py:_set_ro_pragmas`).
- `validate_select_only` SQL gate forbids DDL/DML/PRAGMA/transactions and multi-statement input.
- Single write path: `add_archetype_alias` tool, guarded by `validate_alias_insert_sql`.

## Cross-references

- Detailed Mermaid: `docs/mtg_data_flow.mmd`, `docs/schema.mmd`
- Per-area codemaps: `backend.md`, `frontend.md`, `data.md`, `dependencies.md`
