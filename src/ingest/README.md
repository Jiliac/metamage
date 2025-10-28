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
