---
name: update-meta-changes
description: Bring the site's "Changes" timeline (bans, unbans, restrictions, set releases in `meta_changes`) up to date for every format. Use when the Changes page looks stale or is missing a ban or set, after a B&R announcement or set release, or for a periodic catch-up.
---

# Update meta changes

`data/bans.csv` and `data/sets.csv` are the source of truth. `src/ingest/populate_reference_data.py` loads them into `meta_changes`, and the web Changes page reads that table. The job: find everything announced since the CSVs' last rows, append it, load it.

## Steps

1. **Cutoff.** Per format, note the latest date in `data/bans.csv`. Note the latest `release_date` in `data/sets.csv`. Done when you have a cutoff date for each of: Standard, Pioneer, Modern, Legacy, Vintage, Pauper, Duel Commander, and sets.

2. **Research** from the cutoffs to today with web search, in two parallel subagents (the sources differ):
   - **Wizards formats:** magic.wizards.com "Banned and Restricted" announcements, plus off-cycle Pauper statements, which the Pauper Format Panel publishes on the same site. Also list premier sets released since the sets cutoff, with codes and dates from `api.scryfall.com/sets`.
   - **Duel Commander:** duelcommander.org/announcements and /banlist. The committee split in late 2025. Follow **duelcommander.org**, the body MTGO, Scryfall and the press follow. Ignore mtgdc.info (a single ex-member's site, since replaced by "AeonShift").

   Every row needs its source URL, and every card name must be the exact Oracle name. Unverifiable items go in a separate list, never into the CSV. Done when each format has either new rows or a confirmed "no changes since cutoff".

3. **Append** rows under the conventions below, keeping each file sorted by date.

4. **Load.** Run `uv run python src/ingest/populate_reference_data.py --dry-run` from the repo root and check the `🔌 Target database:` line names the database you mean (no password is printed) and the `➕` lines are exactly your new rows. Then run it without `--dry-run`. The script finds `.env` by walking up from its own path, so worktrees use the main checkout's. It writes through `TOURNAMENT_DATABASE_WRITE_URL`, because the plain read URL is a SELECT-only role and fails with "permission denied for table meta_changes". Done when the `--dry-run` output contains no `➕ Added format` lines: a new format means a label didn't map. An unknown label in `sets.csv`'s `formats` column fails the run instead.

5. **Verify** with a read-only query: `max(date)` per format in `meta_changes` matches the newest CSV row for that format. Then commit the two CSVs.

The site caches `getFormatMetaChanges` for a day (`web/src/datasource/index.ts`). A running dev server shows new rows only after a restart.

## Row conventions

**bans.csv** — `date,format,notes`, with `notes` always double-quoted:
`2026-08-10,Vintage,"The Fantasticar RESTRICTED"`
- One row per format per announcement. Verbs: `BANNED`, `UNBANNED`, `RESTRICTED`, `UNRESTRICTED`. Duel Commander adds `BANNED AS COMMANDER`, `UNBANNED AS COMMANDER`, and moves like `UNBANNED (now BANNED AS COMMANDER)`.
- Format labels: `Standard`, `Pioneer`, `Modern`, `Legacy`, `Vintage`, `Pauper`, `Duel Commander`. The loader turns them into DB slugs (`duel-commander`).
- Card names contain commas ("Nadu, Winged Wisdom"). The quoting carries them, so treat `notes` as display text.
- Dates:
  - Wizards: the effective date, which usually equals the announcement date.
  - Duel Commander: the announcement date (Monday; changes apply "starting today").
  - Pauper off-cycle: the tabletop effective date, even when MTGO applies it later.
- Skip announcements with no card changes in these formats (Arena-only changes included).
- The loader skips a row only when date, format and text all match exactly. Changing an existing row's date or text therefore inserts a second row, and the old one must be deleted from `meta_changes` by hand (see **Correcting a loaded row** below).

**sets.csv** — `set_name,set_code,release_date,standard_rotation,eternal_set,formats`:
- Premier, Standard-legal sets: `eternal_set=FALSE`. They apply to every format.
- Sets with new cards only for eternal formats (Modern Horizons style): `eternal_set=TRUE`. They apply to Modern, Legacy, Vintage, Pauper and Duel Commander.
- `formats` (optional, labels separated by `;`) limits a set to exactly those formats. Use it for products that change legality in only some formats, e.g. `The Zeta Set,SLZ,2026-09-07,FALSE,TRUE,Pauper`.
- Leave out bonus and Commander products released the same day as their main set ("… Eternal", precons). The main set's row already marks that date.
- `standard_rotation=TRUE` only on the set that triggers a rotation.
- The loader skips a set row when format, date and `set_code` match; the description is not compared. Correcting a set's date or code therefore inserts new rows (one per format the set hits), and the old ones must be deleted by hand.

## Correcting a loaded row

Fix the CSV, load, then delete the stale rows with the write URL. Scope every DELETE to the old values and check the row count before committing. Do it in a transaction:

```sql
BEGIN;
-- bans.csv row: old date + format + exact old notes text
DELETE FROM meta_changes
WHERE change_type = 'BAN'
  AND format_id = (SELECT id FROM formats WHERE name = 'modern')
  AND date = '2024-08-26'
  AND description = 'Nadu Winged Wisdom BANNED, Grief BANNED';
-- sets.csv row: old date + old set code, across every format it hit
DELETE FROM meta_changes
WHERE change_type = 'SET_RELEASE'
  AND date = '2025-02-14'
  AND set_code = 'AER';
COMMIT;  -- only if each DELETE reported the expected count
```

`formats.name` is the DB slug (`duel-commander`), not the CSV label. A set row touches one row per affected format (7 for a Standard-legal set, 5 for an eternal set, fewer with a `formats` column).
