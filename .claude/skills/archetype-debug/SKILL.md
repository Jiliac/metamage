---
name: archetype-debug
description: Debug "Unknown" and "Conflict" archetype buckets in the metamage tournament DB. Use when a meta-share chart shows an unexpected Unknown or Conflict slice, when classification accuracy regresses after a parser update, or when adding/repairing archetype rules. Distinguishes parser bugs (malformed decklists) from real classification gaps (missing aliases or rule overlap), and produces concrete JSON edits to MTGOFormatData rules.
---

# Archetype Debug — Unknown & Conflict Buckets

## When to use

Trigger this when:

- A `meta_presence.png` chart shows a non-trivial **Unknown** or **Conflict** bar.
- Top-finishing decks (PT winner, Challenge top 8) are missing from the classified meta.
- After editing rules in `MTGOFormatData`, the Unknown rate moves unexpectedly.

## Paths

- DB: `data/tournament.db` (SQLite, WAL mode). Use `sqlite3` directly.
- Archetype rules: `~/Development/dev-win/Parser/MTGOFormatData/Formats/<Format>/Archetypes/*.json`
- Models: `src/models/{base,reference,tournament}.py` (read-only ORM; edits to `archetype_aliases` use `get_alias_write_engine()`).

Charts are emitted by `visualize/` into `Results/<Format>/<Year>/<MM-DD-MM-DD>/`.

## Schema cheatsheet

`tournaments(date, format_id, source: MTGO|MELEE|CARDSREALM|OTHER)` → `tournament_entries(player_id, archetype_id, wins/losses/draws, decklist_url)` → `deck_cards(card_id, count, board: MAIN|SIDE)` and `matches(entry_id, opponent_entry_id, result, pair_id)`. `archetypes(format_id, name, color)` joins to `archetype_aliases` (1 alias per archetype, only writable through the alias engine).

The two failure-mode archetype names to know:

- `unknown` — no rule matched.
- `conflict` — two or more rules matched. Even though `conflict(A,B)` pair-strings appear in parser output, the DB normalizes the name to `conflict`.

## Step 1 — Quantify the bucket

```sql
WITH x AS (
  SELECT te.id eid, a.name arch, t.source
  FROM tournament_entries te
  JOIN tournaments t ON t.id=te.tournament_id
  JOIN formats f ON f.id=t.format_id
  JOIN archetypes a ON a.id=te.archetype_id
  WHERE f.name='<FORMAT>' AND t.date >= '<ISO_DATE>'
)
SELECT COUNT(*) total,
       SUM(arch='unknown')   AS unknown,
       SUM(arch='conflict')  AS conflict,
       ROUND(100.0*SUM(arch='unknown') /COUNT(*),2) pct_unknown,
       ROUND(100.0*SUM(arch='conflict')/COUNT(*),2) pct_conflict
FROM x;
```

## Step 2 — Separate parser bugs from real classification gaps

**Parser-bug signature** (incomplete decklist captured by scraper):

```sql
SELECT (SELECT COALESCE(SUM(count),0) FROM deck_cards WHERE entry_id=te.id AND board='MAIN') main,
       (SELECT COALESCE(SUM(count),0) FROM deck_cards WHERE entry_id=te.id AND board='SIDE') side
FROM tournament_entries te WHERE te.id='<ENTRY_ID>';
```

Use `main < 60` (or `main = 40 AND side = 0` for draft pools mistakenly imported in mixed-format PTs). **Never use `main != 60`** — players legally register 61-card maindecks in pauper/legacy and the false-positive rate is >5x the real bug rate.

If `main < 60`, the rule isn't the problem — the scraper imported a partial list. File against ingest, not rules.

## Step 3 — Cluster real Unknown decks

For each unknown entry, tag against signature cards of plausible archetypes:

```sql
WITH unk AS (
  SELECT te.id eid, p.handle, te.wins||'-'||te.losses rec
  FROM tournament_entries te
  JOIN players p ON p.id=te.player_id
  JOIN tournaments t ON t.id=te.tournament_id
  JOIN formats f ON f.id=t.format_id
  JOIN archetypes a ON a.id=te.archetype_id
  WHERE f.name='<FORMAT>' AND t.date >= '<ISO_DATE>' AND a.name='unknown'
)
SELECT u.handle, u.rec,
  EXISTS(SELECT 1 FROM deck_cards dc JOIN cards c ON c.id=dc.card_id
         WHERE dc.entry_id=u.eid AND c.name='<SIGNATURE_CARD>') AS hit
FROM unk u;
```

Drive iteratively: top-N maindeck cards across the unknown set → guess the archetype → tag every entry → repeat for the residual. Color identity (`SELECT GROUP_CONCAT(DISTINCT colors) FROM deck_cards JOIN cards ON …`) helps split mixed-color clusters.

Heuristics:

- **High win-rate cluster** (≥ 7-2 finishers) is almost always a real archetype the rule set hasn't caught up with — high priority.
- **0-0-0 / rank=0 records with `MTGO` source** are usually missing match data, not unknowns to act on.
- **Mixed-format PT events (e.g. PT SOS)** generate ~15 draft-shape entries per event in `Standard` — that is a parser bug (wrong list URL), not a rule gap.

Once a cluster is confirmed, add an alias rule (a new `<Archetype>.json` or a `Variants[]` entry) — do **not** insert directly into `archetype_aliases`; the rule engine writes that table.

## Step 4 — Resolve Conflict pairs

A `conflict` row means ≥2 JSON rules' `Conditions` block were all true. Tag each conflict entry against the suspected colliding signature cards:

```sql
WITH c AS (
  SELECT te.id eid, p.handle, te.wins||'-'||te.losses rec
  FROM tournament_entries te
  JOIN players p ON p.id=te.player_id
  JOIN tournaments t ON t.id=te.tournament_id
  JOIN formats f ON f.id=t.format_id
  JOIN archetypes a ON a.id=te.archetype_id
  WHERE f.name='<FORMAT>' AND t.date >= '<ISO_DATE>' AND a.name='conflict'
)
SELECT c.handle, c.rec,
  EXISTS(SELECT 1 FROM deck_cards dc JOIN cards x ON x.id=dc.card_id WHERE dc.entry_id=c.eid AND x.name='<SIG_A>') a,
  EXISTS(SELECT 1 FROM deck_cards dc JOIN cards x ON x.id=dc.card_id WHERE dc.entry_id=c.eid AND x.name='<SIG_B>') b
FROM c;
```

Rank pairs by frequency. For the top pair, decide who "wins" the deck (which archetype is the player actually piloting?) and add a **`DoesNotContain` exclusion to the loser** in its JSON file.

Pattern in the rule files:

```json
{
  "Type": "DoesNotContain",
  "Cards": ["<SIG_OF_OTHER_ARCHETYPE>"]
}
```

Or, when a deck is a _legitimate hybrid_, add a `Variants[]` entry (e.g. `Naya Ephemerate Gates`) instead of excluding it.

## Pitfalls

- **Narrowing a trigger to fix a conflict often inflates Unknown.** A card like `Ephemerate` looks "splashable" but is actually concentrated in one archetype — verify by counting how many "unknown after the change" decks contain it before narrowing. Prefer `DoesNotContain` over removing a card from the trigger list.
- **`main != 60` flags 5x more legal 61-card maindecks than real parser bugs.** Always split into `main<60` (real bug) and `main>60` (legal).
- **Phantom archetypes:** rows in `archetypes` with zero `archetype_aliases` rows but non-zero entries are usually dead labels (e.g. an old `conflict` artifact) — surface them with `LEFT JOIN archetype_aliases … WHERE alias.id IS NULL`.
- **`color` column on `archetypes` is unreliable** — derive deck color identity from card colors, not the archetype row.
- **Duel-commander uses 99-card singletons** — exclude it from any 60-card sanity check.

## Quick rerun loop

1. Edit JSON in `~/Development/dev-win/Parser/MTGOFormatData/Formats/<Format>/Archetypes/`.
2. Re-run the parser → it rewrites `archetypes` / entry classifications in the DB.
3. Re-run Step 1 query for the same window to verify the bucket moved as predicted.
4. If Unknown rose by ~the amount Conflict fell, you over-tightened a rule — apply a `DoesNotContain` instead.

See `references/rule-edit-recipes.md` for worked examples of the four common edit shapes (exclude-by-card, add-variant, split-by-color, fog-style positive guard).
