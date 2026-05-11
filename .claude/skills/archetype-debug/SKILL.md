---
name: archetype-debug
description: Debug "Unknown" and "Conflict" archetype buckets in the metamage tournament DB, AND validate/invalidate archetype display names against community usage. Use when a meta-share chart shows an unexpected Unknown or Conflict slice, when classification accuracy regresses after a parser update, when adding/repairing archetype rules, or when an archetype's name looks wrong (suspected misnomer, suspected split/merge with another bucket). Distinguishes parser bugs (malformed decklists) from real classification gaps (missing aliases or rule overlap), validates archetype identity by comparing card-distributions between buckets and cross-checking against mtgtop8/MTGGoldfish/CardsRealm via the Exa MCP, and produces concrete JSON edits to MTGOFormatData rules.
---

# Archetype Debug — Unknown & Conflict Buckets

## When to use

Trigger this when:

- A `meta_presence.png` chart shows a non-trivial **Unknown** or **Conflict** bar.
- Top-finishing decks (PT winner, Challenge top 8) are missing from the classified meta.
- After editing rules in `MTGOFormatData`, the Unknown rate moves unexpectedly.
- An archetype's display name looks wrong (e.g. "Selesnya Cub" for a deck the community calls "Selesnya Ouroboroid"), or two archetypes look like the same deck under different names, or one bucket looks like it's silently merging two distinct decks.

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

## Step 5 — Validate an archetype's name (rename / split / merge)

Use this when our display name looks wrong, two archetypes look like the same deck, or one bucket might be silently merging two distinct decks (e.g. "Selesnya Cub" actually being Selesnya Ouroboroid + Selesnya Landfall lumped together).

### 5a — Fingerprint the bucket

Pull (i) top finishers with event names and dates, (ii) repeat pilots (grinders), and (iii) the most-played maindeck cards. The top cards give the deck a search-fingerprint and let you sanity-check the deck's identity before anything else:

```sql
-- Top performers with event names (search-anchors for Exa)
SELECT p.handle, te.wins||'-'||te.losses||'-'||te.draws rec,
       t.name event, t.date, t.source, te.decklist_url
FROM tournament_entries te
JOIN players p ON p.id=te.player_id
JOIN tournaments t ON t.id=te.tournament_id
JOIN formats f ON f.id=t.format_id
JOIN archetypes a ON a.id=te.archetype_id
WHERE f.name='<FORMAT>' AND t.date >= '<ISO_DATE>' AND a.name='<ARCHETYPE>'
ORDER BY te.wins DESC LIMIT 15;

-- Top maindeck cards (the deck's fingerprint)
WITH bucket AS (
  SELECT te.id eid FROM tournament_entries te
  JOIN tournaments t ON t.id=te.tournament_id
  JOIN formats f ON f.id=t.format_id
  JOIN archetypes a ON a.id=te.archetype_id
  WHERE f.name='<FORMAT>' AND t.date >= '<ISO_DATE>' AND a.name='<ARCHETYPE>'
)
SELECT c.name, COUNT(DISTINCT dc.entry_id) decks, SUM(dc.count) copies
FROM bucket JOIN deck_cards dc ON dc.entry_id=bucket.eid AND dc.board='MAIN'
JOIN cards c ON c.id=dc.card_id
GROUP BY c.name ORDER BY decks DESC, copies DESC LIMIT 25;
```

### 5b — Card-distribution divergence (when comparing two buckets)

To confirm two archetypes are genuinely different (or that they're the same deck under different names), compute per-card prevalence in each bucket and sort by the absolute difference:

```sql
WITH a_e AS (SELECT te.id eid FROM tournament_entries te JOIN tournaments t ON t.id=te.tournament_id JOIN formats f ON f.id=t.format_id JOIN archetypes a ON a.id=te.archetype_id WHERE f.name='<FORMAT>' AND t.date >= '<ISO_DATE>' AND a.name='<ARCH_A>'),
b_e AS (SELECT te.id eid FROM tournament_entries te JOIN tournaments t ON t.id=te.tournament_id JOIN formats f ON f.id=t.format_id JOIN archetypes a ON a.id=te.archetype_id WHERE f.name='<FORMAT>' AND t.date >= '<ISO_DATE>' AND a.name='<ARCH_B>'),
an AS (SELECT COUNT(*) n FROM a_e), bn AS (SELECT COUNT(*) n FROM b_e),
ac AS (SELECT card_id, COUNT(DISTINCT entry_id) d FROM deck_cards WHERE entry_id IN (SELECT eid FROM a_e) AND board='MAIN' GROUP BY card_id),
bc AS (SELECT card_id, COUNT(DISTINCT entry_id) d FROM deck_cards WHERE entry_id IN (SELECT eid FROM b_e) AND board='MAIN' GROUP BY card_id)
SELECT c.name,
  ROUND(100.0*COALESCE(ac.d,0)/(SELECT n FROM an),0) a_pct,
  ROUND(100.0*COALESCE(bc.d,0)/(SELECT n FROM bn),0) b_pct,
  ABS(ROUND(100.0*COALESCE(ac.d,0)/(SELECT n FROM an),0) - ROUND(100.0*COALESCE(bc.d,0)/(SELECT n FROM bn),0)) diff
FROM cards c LEFT JOIN ac ON ac.card_id=c.id LEFT JOIN bc ON bc.card_id=c.id
WHERE (ac.d IS NOT NULL OR bc.d IS NOT NULL) AND COALESCE(ac.d,0)+COALESCE(bc.d,0) >= 5
ORDER BY diff DESC LIMIT 30;
```

**How to read the output:**

- **Engine cards 95%+ exclusive to each side** → genuinely different archetypes. Keep the split.
- **Overlap only in manabase + format-staple sideboard cards** (Force of Will, Brainstorm, Cast Down, Nihil Spellbomb, basics, fetches) → still different decks.
- **>50% of mid-prevalence cards (40–80% range) overlap** → likely the same deck under two names; consider merging.
- **One bucket's engine ⊂ the other's engine, plus extra payoffs** → the smaller bucket is probably a variant; consider `Variants[]` instead of a separate `<Archetype>.json`.

### 5c — Cross-check the community name via the Exa MCP

Once you have the fingerprint, search what the community calls the deck. **Use the Exa MCP, not WebSearch** — `mcp__exa__web_search_exa` returns higher-signal, ranked highlights that surface mtgtop8/MTGGoldfish/CardsRealm reliably; `mcp__exa__web_fetch_exa` reads a single URL as clean markdown when an event page needs deeper inspection.

Query shape: describe the ideal page, anchor on hard signals (3–5 distinctive card names + format + date or event name + a known player handle from Step 5a). Specific queries beat keyword soups:

```
Legacy Aluren Show and Tell Acererak Atraxa Omniscience combo 2026 decklist
Pro Tour Secrets of Strixhaven 2026 Standard Selesnya Landfall Badgermole Cub decklist
Legacy Azorius Stifle Tamiyo Phelia Quantum Riddler Wasteland April 2026
```

Reconcile across sources — they often disagree, and the disagreement itself is the signal:

- **MTGGoldfish / CardsRealm** — finer-grained naming, usually engine-based. Best source for the "modern" community name. Example: distinguishes "Selesnya Ouroboroid" (Matt Nass) from "Selesnya Landfall" (Larsen/Steuer).
- **mtgtop8** — coarser, uses generic family buckets ("UWx Control", or lumping landfall-shell decks under one "Selesnya Landfall" regardless of payoff). Useful as a sanity check but not authoritative for naming.
- **Reddit r/<format>** — colloquial names ("Aluren Tell", "Omni-Tell"), good signal when there's no canonical name yet.
- **Pro Tour / Challenge winners** — if a winner's list is everywhere under name X, that's the strongest evidence.

### 5d — Decide and apply

- **Community is consistent on a different name** → rename. Edit the `"Name"` field in the relevant `<Archetype>.json` (with `IncludeColorInName` if appropriate). Example: `"Cub"` → `"Ouroboroid"` so the display becomes `selesnya ouroboroid` / `bant ouroboroid`.
- **Community is split** → pick the name MTGGoldfish/CardsRealm uses (more granular and engine-based); document the alternates in a comment or stash the discussion in the commit message.
- **Two of our buckets look identical** → merge by deleting the duplicate JSON and adding its triggers as a `Variants[]` entry on the survivor.
- **One bucket silently holds two decks** (low engine-card overlap inside the same archetype) → split into two JSONs, each with a tighter trigger. Re-run the parser and the Step 5b query to verify the split landed.

Worked example from session history: our `selesnya cub` archetype (`InMainboard: Ouroboroid + Badgermole Cub`) is 100% Ouroboroid-engine decks (0% Mightform Harmonizer / Earthbender Ascension / Sazh's Chocobo). Exa shows MTGGoldfish/CardsRealm call this exact list "Selesnya Ouroboroid" and reserve "Selesnya Landfall" for the no-Ouroboroid landfall-payoff build that lives in our separate `landfall` archetype. Fix is a one-line rename in `UGMidrange.json`: `"Name": "Cub"` → `"Name": "Ouroboroid"`.

## Pitfalls

- **Narrowing a trigger to fix a conflict often inflates Unknown.** A card like `Ephemerate` looks "splashable" but is actually concentrated in one archetype — verify by counting how many "unknown after the change" decks contain it before narrowing. Prefer `DoesNotContain` over removing a card from the trigger list.
- **`main != 60` flags 5x more legal 61-card maindecks than real parser bugs.** Always split into `main<60` (real bug) and `main>60` (legal).
- **Phantom archetypes:** rows in `archetypes` with zero `archetype_aliases` rows but non-zero entries are usually dead labels (e.g. an old `conflict` artifact) — surface them with `LEFT JOIN archetype_aliases … WHERE alias.id IS NULL`.
- **`color` column on `archetypes` is unreliable** — derive deck color identity from card colors, not the archetype row.
- **Duel-commander uses 99-card singletons** — exclude it from any 60-card sanity check.
- **Format-name case matters in SQL.** The `formats.name` column is lowercase (`'standard'`, `'legacy'`, `'pauper'`). `WHERE f.name='Standard'` silently returns zero rows. Always lowercase.
- **mtgtop8 lumps; MTGGoldfish splits.** Don't take a single source as authoritative for naming — mtgtop8 routinely puts two distinct engine builds under one family label. Always cross-check with MTGGoldfish/CardsRealm when the deck has a non-trivial engine.
- **Don't search Exa with vague queries.** "Selesnya Standard 2026" returns generic noise; "Standard Selesnya Landfall Badgermole Cub Mightform Harmonizer Pro Tour Strixhaven 2026" returns the exact event pages. Anchor on 3–5 signature cards + format + event/date.

## Quick rerun loop

1. Edit JSON in `~/Development/dev-win/Parser/MTGOFormatData/Formats/<Format>/Archetypes/`.
2. Re-run the parser → it rewrites `archetypes` / entry classifications in the DB.
3. Re-run Step 1 query for the same window to verify the bucket moved as predicted.
4. If Unknown rose by ~the amount Conflict fell, you over-tightened a rule — apply a `DoesNotContain` instead.

See `references/rule-edit-recipes.md` for worked examples of the four common edit shapes (exclude-by-card, add-variant, split-by-color, fog-style positive guard).
