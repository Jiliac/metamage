<!-- Generated: 2026-10-06 | Files scanned: ~220 | Token estimate: ~900 -->

# MetaMage — Architecture

MTG tournament analysis toolkit. Tournament data → Tournament DB (Postgres prod / SQLite dev) → MCP tools → chat/social/UI/R consumers.

## System Map

```
External MTG data (MTGODecklistCache + MTGOArchetypeParser JSON)
            │
            ▼
   src/ingest (Python)        ── builds ──▶  Tournament DB  (Postgres prod / SQLite dev; read-only at runtime)
                                              │
                                              ├──▶ src/mcp_server (FastMCP)          ── tools/resources ─▶  MCP clients
                                              │      │
                                              │      └──▶ src/analysis (compute_*)
                                              │
                                              └──▶ visualize/ (R, RPostgres/RSQLite) ── plots ─▶  Results/*.pdf, marav.csv

   MCP clients (LLM agents reading tools):
     ├─ src/cli_chat/chat_agent      (terminal ReAct loop)
     ├─ src/cli_chat/discord_bot     (Discord slash cmds)
     └─ src/socialbot/server         (Bluesky/Twitter responder)

   All agents persist sessions/tool calls → Ops DB (Postgres preferred; SQLite fallback)
     └─ ui/  (Next.js 15)            reads Ops DB via Prisma → /sessions, /tool/[id]

   Tournament DB is also served directly to the public web app:
     └─ web/  (Next.js 15; DATA_SOURCE=fixtures|postgres) → meta explorer pages

   CI: .github/workflows/ci-python|ci-web|ci-ui gate PRs by path slice; docs-only PRs run none.
   Deploy: Vercel git integration — push to main deploys both apps (per-slice previews).
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
| Web app             | `web/`               | Next.js 15 / postgres | Tournament DB (ro) or fixtures | —                                    |
| Social adapters     | `src/social_clients` | Python httpx/tweepy   | Bluesky/Twitter APIs       | platform-side replies                    |

## Two Databases

- **Tournament DB** (Postgres prod / SQLite dev) — domain data. Dual-mode engine in `src/models/base.py` selects Postgres via `TOURNAMENT_DATABASE_URL`, else the local SQLite file. Models in `src/models/`, schema in `docs/schema.mmd`. Fresh Postgres is bootstrapped via `create_all` + `alembic stamp head`; backfill via `scripts/migrate_tournament_to_postgres.py`.
- **Ops DB** (Postgres prod / SQLite dev) — chat sessions, tool calls, social notifications. Models in `src/ops_model/`. UI Prisma schema mirrors `chat_models.py` at `ui/prisma/schema.prisma`.

Both DBs can share one Neon project as separate databases.

## CI & Deployment

- Three path-filtered workflows in `.github/workflows/`: `ci-python` (ruff + pytest), `ci-web` (lint/format/tsc/vitest/build — hermetic `DATA_SOURCE=fixtures`), `ci-ui` (lint/format/tsc/build — needs `OPS_DATABASE_URL`, since Prisma runs at build time). Docs-only PRs run none. Builds use frozen lockfiles, Node 24 + pnpm 11 / Python 3.13 via `uv`.
- Vercel git integration: `metamage-web` (`web/` → metamages.com, Tournament DB) and `metamage-ui` (`ui/` → ai.metamages.com, Ops DB). Push to `main` deploys; PRs get per-slice previews via an Ignored Build Step. The Postgres read path (`DATA_SOURCE=postgres`) is only exercised by Vercel builds — a red Vercel check is a real signal.
- Details + env vars per project: README "Continuous Integration & Deployment"; plan in `docs/plans/2026-09-28-ci-cd-deploy-web-ui-plan.md`.

## Read-only Hardening (MCP)

- Read-only enforced per dialect by `apply_read_only` (`src/mcp_server/utils.py`): SQLite gets `PRAGMA query_only=ON`; Postgres uses the `metamage_ro` SELECT-only role plus `default_transaction_read_only` (defense-in-depth). Roles in `scripts/setup_pg_roles.sql`.
- `validate_select_only` SQL gate forbids DDL/DML/PRAGMA/transactions and multi-statement input (dialect-agnostic).
- Single write path: `add_archetype_alias` tool, guarded by `validate_alias_insert_sql`, via `get_alias_write_engine` (the `metamage_rw` role / `TOURNAMENT_DATABASE_WRITE_URL`).

## Cross-references

- Detailed Mermaid: `docs/mtg_data_flow.mmd`, `docs/schema.mmd`
- Per-area codemaps: `backend.md`, `frontend.md`, `data.md`, `dependencies.md`
