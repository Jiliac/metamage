# Ingestion Utilities

## Overview

- Build or extend the SQLite tournament database from JSON inputs and external caches

## Typical steps

### 1) Populate reference data (formats, set releases, bans)

```bash
python src/ingest/populate_reference_data.py
```

### 2) Ingest from a JSON export

```bash
python src/ingest/ingest_tournament_data.py -f path/to/data.json
```

- Flags: `--archetypes` | `--players` | `--cards` | `--entries`
- Optional: `--date YYYY-MM-DD` to filter older entries out

## Notes

- Rounds files (for matches and ranks) are located via `data/config_tournament.json` and on-disk caches
- Cards are resolved via Scryfall (`oracle_id`, colors, first-printed set), with rate limiting and caching
- **Idempotency:** entries are upserted per tournament+player, deck cards rebuilt once, matches checked for duplicates

If you don't have the `tournament.db`, email: `valentinmanes@outlook.fr` for a prebuilt SQLite DB.

## Card data backfill (operator runbook)

Data flow: ingest writes to SQLite (`data/tournament.db`), and Neon is fed from
SQLite by `scripts/migrate_tournament_to_postgres.py`. The card data is produced
once, in SQLite; Neon needs only the schema change, because a reload COPYs into
existing tables and does not add columns.

Each Alembic step confirms the dialect it logs (`SQLiteImpl` or
`PostgresqlImpl`), because `alembic/env.py` loads the repo-root `.env`, which
sets `TOURNAMENT_DATABASE_URL` (Neon).

1. Checkpoint the WAL and back up `data/tournament.db`.
2. Migrate SQLite with `TOURNAMENT_DATABASE_URL=` set to an empty string (not
   unset, or `.env` redirects Alembic to Neon):

   ```bash
   sqlite3 data/tournament.db "PRAGMA wal_checkpoint(TRUNCATE);" && cp data/tournament.db data/tournament.db.bak
   TOURNAMENT_DATABASE_URL= alembic upgrade head   # expect SQLiteImpl
   ```

3. Backfill SQLite: dry run first, then for real. Pass
   `--oracle path/to/oracle_cards.jsonl.gz` to reuse a local download instead of
   fetching the bulk file:

   ```bash
   TOURNAMENT_DATABASE_URL= python scripts/backfill_card_data.py --dry-run
   TOURNAMENT_DATABASE_URL= python scripts/backfill_card_data.py
   ```

4. Migrate Neon schema (`TOURNAMENT_DATABASE_URL` set to the rw role), outside
   ingest and reload windows. The migration sets its own `lock_timeout`:

   ```bash
   TOURNAMENT_DATABASE_URL=postgresql://... alembic upgrade head   # expect PostgresqlImpl
   ```

5. Fill Neon's new columns. Either run the next full reload from SQLite (the
   usual truncate + COPY), or run the backfill against Neon directly to skip the
   ~20-minute reload. Both give the same rows:

   ```bash
   TOURNAMENT_DATABASE_URL=postgresql://... python scripts/backfill_card_data.py
   ```

6. Run the verification checks below on both DBs.
7. Push the web branch (this opens a Vercel preview against Neon), then deploy.

Verification checks, on both DBs:

- `alembic_version` equals the new revision.
- All eight columns exist (`information_schema.columns` on Neon), and
  `metamage_ro` can select them (`has_column_privilege`).
- Fewer than 1% of `cards` rows have null `type_line`, and SQLite and Neon agree.
- No row has `type_line` set while `display_name` or `image_normal` is null.
- The non-null `image_back` count is close to the double-faced card count.
- `deck_cards` and `card_colors` row counts match the pre-migration counts.

After any full reload, a Neon backfill run should update zero rows; this is the
parity check. Cards whose bulk-file entry lacks required fields (inside the 1%
pre-flight tolerance) are never written; each run lists them as `skipped`, and
they stay null. Re-run the backfill (without `--refresh`) after any ingest that
hit Scryfall errors.
