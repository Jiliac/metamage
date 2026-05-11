<!-- Generated: 2026-05-11 | Files scanned: ~80 | Token estimate: ~950 -->

# Backend Codemap

Python services in `src/`. All MCP tools read `data/tournament.db` (or `TOURNAMENT_DB_PATH`) read-only.

## Entry Points

| Command                                               | Module                                 | Purpose                                   |
| ----------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| `uv run -m src.mcp_server.server --http\|--stdio`     | `src/mcp_server/server.py`             | FastMCP server                            |
| `uv run -m src.cli_chat.chat_agent --provider claude` | `src/cli_chat/chat_agent.py`           | Terminal ReAct agent                      |
| `uv run -m src.cli_chat.discord_bot`                  | `src/cli_chat/discord_bot.py`          | Discord slash cmds (`/mage`, `/mageping`) |
| `uv run -m src.cli_chat.list_tool`                    | `src/cli_chat/list_tool.py`            | Sanity-check MCP tool listing             |
| `uv run -m src.socialbot.server`                      | `src/socialbot/server.py`              | Bluesky/Twitter responder                 |
| `uv run -m src.ingest.ingest_tournament_data`         | `src/ingest/ingest_tournament_data.py` | Build tournament.db                       |

## MCP Server (`src/mcp_server/`)

Tool registry: `mcp.py` instantiates `FastMCP(...)` then imports all tool modules; each uses `@mcp.tool` to register.

| Tool name                                 | Module                 | Compute layer                                      | Notes                         |
| ----------------------------------------- | ---------------------- | -------------------------------------------------- | ----------------------------- |
| `list_formats`, `get_format_meta_changes` | `format.py`            | direct SQL                                         | 2 tools in one file           |
| `get_meta_report`                         | `meta_report.py`       | `analysis/meta.py:compute_meta_report`             | presence/winrate by archetype |
| `get_archetype_overview`                  | `archetype.py`         | `analysis/archetype.py:compute_archetype_overview` | fuzzy name resolve            |
| `get_archetype_cards`                     | `archetype_cards.py`   | `analysis/archetype.py:compute_archetype_cards`    | top cards per archetype       |
| `get_archetype_winrate`                   | `archetype_wr.py`      | `analysis/archetype.py:compute_archetype_winrate`  | optional mirror exclude       |
| `get_archetype_trends`                    | `archetype_trend.py`   | `analysis/archetype.py:compute_archetype_trends`   | weekly buckets                |
| `get_matchup_winrate`                     | `matchup_wr.py`        | `analysis/matchup.py:compute_matchup_winrate`      | head-to-head                  |
| `get_card_presence`                       | `card_presence.py`     | `analysis/card.py:compute_card_presence`           | top cards in format           |
| `get_tournament_results`                  | `tournament_result.py` | direct SQL                                         | top 8 breakdown               |
| `get_sources`                             | `sources.py`           | `analysis/sources.py:compute_sources`              | tournament links              |
| `search_card`                             | `search_card.py`       | `analysis/card.py:search_card`                     | fuzzy card lookup             |
| `get_player`                              | `player.py`            | `analysis/player.py:compute_player_profile`        | UUID or handle                |
| `query_database`                          | `query_db_any.py`      | `validate_select_only` → SQLAlchemy                | SELECT/CTE only               |
| `add_archetype_alias`                     | `archetype_alias.py`   | `analysis/archetype_action.py:add_archetype_alias` | **only write tool**           |

Shared helpers (`src/mcp_server/utils.py`):

- `get_session()` — read-only SQLAlchemy session factory
- `_set_ro_pragmas` — `query_only=ON` on every connection
- `validate_select_only`, `validate_alias_insert_sql`, `validate_alias_string`
- `validate_date_range`, `check_session_rate_limit`, `validate_archetype_exists`

Server transport (`server.py`): argparse → `mcp.run(transport="http"|"stdio", host, port)`.

## Chat Agents (`src/cli_chat/`)

```
discord_bot.MTGBot ─┐
chat_agent.MTGChatAgent ─┴─▶ langgraph ReAct loop
                            ├─ mcp_client.py    (MCP tool adapter)
                            ├─ system_prompt.py (agent prompt)
                            ├─ chat_logger.py   (Ops DB writes)
                            └─ titler.py        (session title gen)
```

Providers: Claude (default), Opus, GPT-5, Gemini-2.5, xAI — via `langchain-*` adapters.

## SocialBot (`src/socialbot/`)

Polling loop: `server.main()` → `poll_and_process_once` per platform (bluesky/twitter):

1. `poll_and_upsert` — fetch notifications via `social_clients` → upsert `SocialNotification`
2. `claim_next_pending` — pick one
3. `processor.process_one_notification`:
   - `fetch_thread_and_update` — pull thread
   - `triage.should_answer_notification` — LLM gate (skippable)
   - `build_conversation_messages` → `agent_runner.run_agent_with_logging` (MCP-backed)
   - `summarize_with_link` — ≤300 char reply + session URL
   - reply via `social_clients` adapter

## Analysis Layer (`src/analysis/`)

Pure compute functions taking SQLAlchemy `Engine`. Used by MCP tools and any direct caller. Files: `archetype.py`, `archetype_action.py`, `card.py`, `matchup.py`, `meta.py`, `player.py`, `sources.py`.

## Social Clients (`src/social_clients/`)

Protocol `SocialClient` in `base.py`. Mixin composition:

- `BlueskyClient(HTTPMixin, AuthMixin, PostingMixin, NotificationsMixin)`
- `TwitterClient(AuthMixin, PostingMixin, NotificationsMixin)` (tweepy-based)
- `SocialMultiplexer` fans out posts/notifications across enabled platforms.
