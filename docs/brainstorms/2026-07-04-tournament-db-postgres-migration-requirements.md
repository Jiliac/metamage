---
date: 2026-07-04
topic: tournament-db-postgres-migration
---

# Tournament DB → Online Postgres Migration

## Summary

Move the tournament dataset off the local `data/tournament.db` SQLite file onto
online Postgres, consolidated onto the **existing Neon project** where the Ops DB
already lives, after right-sizing the Neon plan. The weekly ingest writes directly
to Postgres, the local SQLite artifact is retired, and the R visualization layer is
ported from RSQLite to RPostgres so the monthly graphs keep publishing. The schema
is already SQLAlchemy + Alembic with Postgres-compatible types, so this is a
re-point-and-validate, not a rewrite.

---

## Problem Frame

The tournament domain data — 4.6K tournaments, ~235K entries, ~1.1M matches, and
the large `deck_cards` table (~4.2 GB total) — lives only as a local SQLite file
rebuilt by the weekly ingest. Nothing downstream of the maintainer's laptop can
query it: the website that the strategy calls for cannot be built on a file that
isn't online, and third parties / agents have no shared source of truth. The Ops DB
is already Postgres on Neon, so the project already runs Postgres in production —
the tournament data is the one piece still stranded on a local file. This migration
is the backbone track from `STRATEGY.md`: nothing self-serve is possible until the
data is online.

---

## Key Decisions

- **Consolidate onto the existing Neon, don't switch providers.** The driver for
  leaving Neon was cost, but current pricing (post-2025 storage repricing, plus
  scale-to-zero) makes Neon the cheapest option at this scale (~$2–4/mo), and the
  Ops DB is already there. The move is to right-size the current Neon plan first,
  then host tournament data on the same project. Supabase/Railway were evaluated
  and rejected on price and lack of a bundle benefit for a public read-only site.

- **Postgres-only at runtime; retire the local SQLite.** The ingest writes to
  Postgres and no local `tournament.db` is produced for runtime consumers. Chosen
  over a dual-output (build-local-then-push) model for a cleaner end state,
  accepting the R port and the loss of a zero-setup local dev DB as the cost.

- **Separate database within the same Neon project, not a shared schema.** Tournament
  data and Ops data keep their logical boundary (read-only domain store vs.
  read-write telemetry) by living in separate databases on one Neon project —
  consolidating billing and compute without collapsing the boundary the architecture
  enforces.

- **Read-only protection moves to a dedicated Postgres role.** SQLite's `mode=ro`
  and `PRAGMA query_only=ON` have no Postgres equivalent. The MCP server connects as
  a role with only `SELECT` privileges on the tournament database; the existing
  `validate_select_only` SQL gate is retained as defense-in-depth.

- **Reuse the Ops DB's dual-mode engine pattern.** `src/ops_model` already selects
  Postgres vs. SQLite from a `POSTGRES_URL`-style env var and ships a
  `migrate_to_postgres.py` template. The tournament models in `src/models` gain the
  same connection-selection mechanism rather than inventing a new one.

---

## Requirements

### Data backbone

- R1. The tournament dataset is hosted on Postgres in the existing Neon project, in
  a database logically separate from the Ops DB.
- R2. The Neon plan is reviewed and right-sized (correct tier + scale-to-zero
  confirmed) before the tournament data is loaded, so the consolidated bill matches
  the ~$2–4/mo expectation for this workload.
- R3. Existing schema is expressed on Postgres with native equivalents for the
  Postgres-targeted types the schema already declares (`citext` for case-insensitive
  columns replacing the SQLite `CaseInsensitiveText` shim, `pg_trgm` for player fuzzy
  search, UUID keys). The Alembic history remains the source of schema truth.
- R4. A one-time backfill loads the current ~4.2 GB of tournament data into Postgres,
  validated for row-count parity against the last SQLite build.

### Ingestion

- R5. The ingest (`src/ingest`) writes tournament data to Postgres via a connection
  selected from an environment variable, using the same selection pattern as
  `src/ops_model`.
- R6. Bulk-write paths (the large `matches` and `deck_cards` inserts) use a direct
  (non-pooled) connection suitable for high-volume loads, so a full weekly ingest
  completes in an acceptable window.
- R7. The local SQLite build path for tournament data is retired; no runtime consumer
  depends on `data/tournament.db`.

### Consumers

- R8. The MCP server (`src/mcp_server`) reads tournament data from Postgres, connected
  as a read-only role (R11), with the `validate_select_only` gate retained.
- R9. SQLite-dialect query logic is validated against Postgres — in particular the
  date-range comparison handling and any string/collation-sensitive queries behave
  identically or are corrected.
- R10. The R visualization layer (`visualize/`) reads tournament data from Postgres
  via RPostgres, and the existing monthly graphs render unchanged from the new source.

### Safety & access

- R11. A dedicated Postgres role with `SELECT`-only privileges on the tournament
  database exists and is used by all read-only consumers (MCP, R). Write access
  (ingest) uses a separate privileged role.
- R12. Connection strings and credentials are supplied via environment /
  configuration, never committed, consistent with existing Ops DB handling.

---

## Scope Boundaries

### Deferred for later

- **The website's read path.** Whether the future web app reads tournament data via a
  second Prisma datasource, a Python API over the MCP layer, or direct SQL is an
  explorer-track decision. Consolidating onto the same Neon as the Ops DB keeps a
  future Prisma datasource cheap, but the choice is not made here.
  - _Note (2026-07-05, web explorer skeleton):_ the new `web/` app reads through a
    `MetaDataSource` interface (`web/src/datasource/index.ts`). Today
    `DATA_SOURCE=postgres` **silently falls back to fixtures** (with a
    `console.warn`). Whoever implements the website's Postgres read path must
    replace that fallback with the real `PostgresDataSource` and make an unknown
    `DATA_SOURCE` a hard error — serving fixture data under a postgres config in
    production would be a silent data-integrity failure.
- **Schema trimming / dedup.** The `matches` table stores both sides of each pairing
  and reference data could be pruned; the data moves as-is this round. Footprint
  reduction is a separate, optional follow-up.

### Outside this migration

- Real-time or daily ingestion — the weekly manual pipeline stays (per `STRATEGY.md`).
- Mastra agent rebuild and the MCP server rewrite — parked at the strategy level.

---

## Dependencies / Assumptions

- **Neon supports the required extensions.** `citext` and `pg_trgm` must be
  installable (`CREATE EXTENSION`) on the target Neon database. Assumed true for Neon;
  verify during planning.
- **Dev workflow shifts to Postgres.** With local SQLite retired, development runs
  against a Neon branch (cheap, isolated) or a local Postgres. Assumed acceptable;
  Neon branching is the intended default.
- **Alembic migrations run cleanly on Postgres.** The migration history was authored
  with Postgres-compatible types; assumed to `upgrade head` on a fresh Postgres
  database without SQLite-only assumptions. Verify during planning.
- The ingest is run from an environment that can reach Neon directly (for bulk
  loads), not only through a pooled connection.

---

## Outstanding Questions

### Resolve before planning

- None blocking. The provider, sync model, consumer set, and safety model are settled.

### Deferred to planning / codebase exploration

- Exact backfill mechanism — Alembic `upgrade head` on empty Postgres then a bulk data
  load (COPY / batched insert) vs. a one-shot dump-and-transform — decided during
  planning against ingest performance (R6).
- Whether tournament and Ops data end up as two databases in one Neon project or two
  Neon projects under one account — R1 assumes same-project/separate-database; confirm
  against Neon's branching and connection-limit model.
- Whether any SQLite-specific date handling (R9) is broad enough to warrant a small
  shared query-compatibility pass vs. per-call-site fixes.

---

## Sources / Research

- `docs/CODEMAPS/architecture.md` — two-DB model; MCP read-only hardening via SQLite
  `mode=ro` + `PRAGMA query_only=ON` + `validate_select_only`.
- `docs/CODEMAPS/data.md` — tournament schema, Alembic history (11 revisions),
  `citext`/`pg_trgm`/UUID usage, ingestion pipeline (`src/ingest`).
- `src/ops_model` — existing Postgres/SQLite dual-mode engine selection and
  `migrate_to_postgres.py` template to mirror for `src/models`.
- Grounding dossier: `/tmp/compound-engineering/ce-brainstorm/pg-migration/grounding.md`
  — data size (~4.2 GB, ~1.1M matches), SQLite-specific date handling, and the note
  that `src/models` has no Postgres override mechanism yet.
- Provider pricing research (2026): Neon Launch ~$2–4/mo with scale-to-zero (cheapest
  at this scale), Railway ~$3–6/mo, Supabase Pro $25/mo flat, Render ~$20/mo, Fly
  managed $38/mo. Neon's "expensive" reputation traced to pre-2025 storage pricing.
