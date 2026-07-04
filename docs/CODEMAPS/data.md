<!-- Generated: 2026-05-11 | Files scanned: ~25 | Token estimate: ~900 -->

# Data Codemap

Two databases. Tournament DB is the domain store; Ops DB stores agent telemetry.

## Tournament DB (Postgres prod / SQLite dev)

Dual-mode engine in `src/models/base.py`: Postgres when `TOURNAMENT_DATABASE_URL` is set (`postgres://` normalized to `postgresql://`), else the local SQLite file (`TOURNAMENT_DB_PATH` or `data/tournament.db`). Models: `src/models/reference.py` + `src/models/tournament.py`. Schema diagram: `docs/schema.mmd`. Migrations: `alembic/versions/` (10 revisions). The four enum columns use `native_enum=False` (VARCHAR+CHECK) so `create_all` is portable. Case-insensitive columns use the `CaseInsensitiveText` shim (lowercases on write) on both dialects — not native `citext`. Fuzzy search uses portable `LOWER() LIKE` (no FTS5). Fresh Postgres is bootstrapped via `create_all` + `alembic stamp head`.

### Tables

| Table                | Model             | Key columns                                                                                                             | FK / notes                                                               |
| -------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `formats`            | `Format`          | id (uuid), name (citext)                                                                                                | parent of archetypes/tournaments/meta_changes                            |
| `sets`               | `Set`             | id, code (3-letter), name, set_type, released_at                                                                        | source for `cards.first_printed_set_id`                                  |
| `players`            | `Player`          | id, handle, normalized_handle (citext)                                                                                  | fuzzy search via pg_trgm (migration `69dd28a23263`)                      |
| `cards`              | `Card`            | id, name, scryfall_oracle_id (non-null after `c609b14a4e86`), is_land, colors, first_printed_set_id, first_printed_date | `is_land` added by `1a604eff3d98`                                        |
| `card_colors`        | `CardColor`       | card_id FK, color (W/U/B/R/G)                                                                                           | denormalized for color queries (`94be167b4a27`)                          |
| `archetypes`         | `Archetype`       | id, format_id FK, name (citext), color                                                                                  | `UNIQUE(format_id, name)` (`ee940c2f516d`)                               |
| `archetype_aliases`  | `ArchetypeAlias`  | id, archetype_id FK, alias, confidence_score                                                                            | added by `f8cce4bcce99`; populated via MCP write tool                    |
| `meta_changes`       | `MetaChange`      | id, format_id FK, date, change_type (BAN\|SET_RELEASE), description, set_code                                           |                                                                          |
| `tournaments`        | `Tournament`      | id, name, date, format_id FK, source (MTGO\|MELEE\|OTHER), link                                                         | source widened in `ce8d1497fd5a`                                         |
| `tournament_entries` | `TournamentEntry` | id, tournament_id FK, player_id FK, archetype_id FK, wins, losses, draws, rank, decklist_url                            | `UNIQUE(tournament_id, player_id)`; `rank` added by `e9534b7b55c4`       |
| `deck_cards`         | `DeckCard`        | id, entry_id FK, card_id FK, count, board (MAIN\|SIDE)                                                                  | `UNIQUE(entry_id, card_id, board)`                                       |
| `matches`            | `Match`           | id, entry_id FK, opponent_entry_id FK, result (WIN\|LOSS\|DRAW), mirror, pair_id                                        | both sides stored; dedupe by `pair_id` or `entry_id < opponent_entry_id` |

Cascade deletes configured by `0d10e1d0ebdf` so dropping a tournament cleans entries/matches/deck_cards.

### Enums (`src/models/`)

- `TournamentSource`: MTGO, MELEE, OTHER
- `MatchResult`: WIN, LOSS, DRAW
- `BoardType`: MAIN, SIDE
- `ChangeType`: BAN, SET_RELEASE

## Ingestion Pipeline (`src/ingest/`)

```
ingest_tournament_data.main()
  ├─ load_json_data(path)                  ← MTGOArchetypeParser output
  ├─ extract_format_from_filename / get_format_id
  ├─ filter_entries_by_date
  ├─ ingest_players.ingest_players          (handle normalization)
  ├─ ingest_archetypes.ingest_archetypes    (per-format upsert)
  ├─ ingest_entries.ingest_entries          → upsert tournament, entry, deck_cards
  │    └─ ingest_cards (Scryfall lookup + cache)
  └─ ingest_matches.process_matchups_from_entries / process_embedded_rounds_data
       └─ _recompute_wld_for_tournament      (reconciles wins/losses/draws)
```

Special path: `ingest_duel_commander.py` for Duel Commander DB; `commander_archetypes.py` resolves commander → archetype. `rounds_finder.py` locates round data files. `populate_reference_data.py` seeds sets/cards/colors from Scryfall.

## Ops DB

### Chat models (`src/ops_model/chat_models.py`) — mirrored in Prisma (`ui/public/prisma/schema.prisma`)

| Table           | Columns                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `chat_sessions` | id, provider, title, created_at, updated_at                                                           |
| `chat_messages` | id, session_id FK, message_type (user/agent_thought/agent_final), content, sequence_order, timestamps |
| `tool_calls`    | id, message_id FK, tool_name, input_params (JSON), call_id, title, column_names, timestamps           |
| `tool_results`  | id, tool_call_id FK (1:1), result_content (JSON), success, error_message, timestamps                  |

### Social models (`src/ops_model/models.py`)

| Table                  | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `focused_channels`     | Discord channels the bot is enabled in                               |
| `discord_posts`        | logged Discord interactions                                          |
| `social_messages`      | generic stored social messages                                       |
| `passes`               | per-poller cursor state (last_processed_time per platform/pass_type) |
| `social_notifications` | Bluesky/Twitter notifications, processing status, reply linkage      |

## Migrations

Located in `alembic/versions/`. Run via `alembic upgrade head`. `alembic.ini` at repo root.

```
689545bc6892  initial migration with timestamps
ee940c2f516d  add format constraint to archetypes
e9534b7b55c4  rank attribute in tournament entry
ce8d1497fd5a  widen tournaments.source column
0d10e1d0ebdf  setup cascade deletion of tournament
69dd28a23263  enable fuzzy search of player & ...
1a604eff3d98  is_land card type
94be167b4a27  add sets and card_colors tables
c609b14a4e86  non-nullable scryfall id
f8cce4bcce99  add archetype_aliases table
```
