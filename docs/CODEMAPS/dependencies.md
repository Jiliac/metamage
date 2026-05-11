<!-- Generated: 2026-05-11 | Files scanned: pyproject.toml, ui/package.json, .env.example | Token estimate: ~700 -->

# Dependencies Codemap

## External Services

| Service                                 | Used by                                      | Purpose                           | Auth                                                        |
| --------------------------------------- | -------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| Anthropic (Claude)                      | cli_chat, socialbot, summarizer              | LLM provider, default             | `ANTHROPIC_API_KEY`                                         |
| OpenAI (GPT-5)                          | cli_chat (optional), summarizer fallback     | LLM provider                      | `OPENAI_API_KEY`                                            |
| Google (Gemini 2.5)                     | cli_chat (optional)                          | LLM provider                      | `GOOGLE_API_KEY`                                            |
| xAI (Grok)                              | cli_chat (optional)                          | LLM provider                      | xAI key                                                     |
| Nebius                                  | optional inference                           | —                                 | `NEBIUS_API_KEY`                                            |
| Discord                                 | cli_chat/discord_bot, magebridge             | slash cmds (`/mage`, `/mageping`) | `DISCORD_BOT_TOKEN`, `DISCORD_MAGEBRIDGE_TOKEN`             |
| Bluesky                                 | socialbot, social_clients/bluesky            | mentions + replies                | `BLUESKY_USERNAME`/`PASSWORD`                               |
| Twitter/X v2                            | socialbot, social_clients/twitter            | mentions + replies                | `TWITTER_API_KEY`/`SECRET`, `TWITTER_ACCESS_TOKEN`/`SECRET` |
| Scryfall                                | ingest/ingest_cards, populate_reference_data | card metadata (with 429 backoff)  | none (User-Agent header required)                           |
| MTGODecklistCache + MTGOArchetypeParser | upstream JSON inputs to ingest               | source decklists                  | external GitHub repos                                       |
| Postgres                                | Ops DB                                       | session/tool/social storage       | `POSTGRES_URL` / `DATABASE_URL`                             |

## Python Deps (`pyproject.toml`, requires-python ≥ 3.13)

Core:

- `sqlalchemy>=2.0`, `alembic>=1.13`, `psycopg2-binary` — DB layer
- `fastmcp` — MCP server
- `langgraph`, `langchain`, `langchain-anthropic`, `langchain-openai`, `langchain-google-genai`, `langchain-xai`, `langchain-mcp-adapters` — agent stack
- `discord>=2.3` — Discord bot
- `httpx`, `requests` — HTTP clients
- `tweepy` — Twitter v2 client
- `pillow` — image handling
- `python-dotenv` — env loading

Dev: `ruff>=0.12.8` (alembic excluded).

## UI Deps (`ui/package.json`, Node)

- `next@15.5.2`, `react@19.1`, `react-dom@19.1`
- `@prisma/client@^6.15`, `prisma@^6.15` — Postgres access
- Radix primitives: `@radix-ui/react-collapsible`, `react-slot`, `react-tabs`
- `@tanstack/react-table@^8.21` — `QueryResultTable`
- UI: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`
- Markdown: `react-markdown`, `remark-gfm`, `remark-breaks`
- `sql-formatter` — pretty-print SQL in tool views

DevDeps: Tailwind v4 + `@tailwindcss/postcss`, `@tailwindcss/typography`, ESLint flat config.

## R Deps (`visualize/run.R` auto-installs)

`DBI`, `RSQLite`, `glue`, `dplyr`, `tidyr`, `stringr`, `lubridate`, `ggplot2`, `scales`, `ggrepel`, `forcats`, `tibble`, `estimatr` (cluster-robust SEs), `patchwork`.

## Internal Shared Libraries

- `src/models/` — SQLAlchemy models for tournament DB (`Base`, `TimestampMixin`)
- `src/ops_model/` — SQLAlchemy models for Ops DB (Postgres) + Prisma mirror in `ui/public/prisma/schema.prisma`
- `src/analysis/` — pure compute functions consumed by `src/mcp_server/*` tool wrappers
- `src/social_clients/` — protocol + mixin composition (`HTTPMixin`, `AuthMixin`, `PostingMixin`, `NotificationsMixin`); `SocialMultiplexer` fans out
- `src/mana/` — standalone mana base / mulligan simulator (powers `/mana` UI page)
- `src/magebridge/` — Discord ↔ Bluesky bridge utilities

## Environment Variables (canonical list)

```
TOURNAMENT_DB_PATH        SQLite tournament DB path (default data/tournament.db)
POSTGRES_URL / DATABASE_URL  Ops DB (Python / UI)
OPS_DB_PATH / BRIDGE_DB_PATH SQLite Ops fallback
NEXT_PUBLIC_SITE_URL      UI public origin (sitemap/share links)

ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY / NEBIUS_API_KEY
DISCORD_BOT_TOKEN / DISCORD_MAGEBRIDGE_TOKEN
BLUESKY_USERNAME / BLUESKY_PASSWORD
TWITTER_API_KEY / TWITTER_API_SECRET / TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_TOKEN_SECRET
TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET  (v2 OAuth; unused ATM)
TWITTER_POLL_INTERVAL_SECONDS (default 900) / TWITTER_RATE_LIMIT_BACKOFF_SECONDS (default 300)

SOCIALBOT_POLL_INTERVAL / SOCIALBOT_MAX_TO_PROCESS / SOCIALBOT_MAX_TURNS
SOCIALBOT_CONTEXT_MAX_CHARS / SOCIALBOT_TRIAGE / SOCIALBOT_FORCE_ANSWER

MTG_FORMAT / START_DATE / END_DATE / TOP_N / MATRIX_TOP_N  (visualize R)
```
