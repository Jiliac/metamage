---
date: 2026-09-27
topic: tournament-page
status: idea — needs a dedicated plan (ce-plan) before implementation
---

# Tournament Page — One Place to See an Event

## Summary

Replace the current `/meta/[format]/tournaments` route (source cards + a flat
tournament list) with a proper tournament experience: a list of events, and a
page per event showing the standings — who won, what everyone played, and their
record. Clicking a player shows their decklist and their matches in that event.
This is what people come to a tournament page for; the current route only
answers "which events fed this window".

---

## What the user wants

1. **Tournament list** (`/meta/[format]/tournaments`) — events in the window,
   newest first: name, date, source, player count, winner + winning archetype.
   Each row links to the event page.
2. **Tournament page** (`/meta/[format]/tournaments/[id]`) — a mini-standings
   view:
   - Final standings: rank, player, archetype (with art thumbnail + mana pips,
     linking to the archetype page), record (W-L-D).
   - The winner is obvious at a glance (top row treatment / hero).
   - Optional: archetype breakdown of the event (small presence bar or
     "3× Broodscale, 2× Prowess …" summary).
3. **Player-in-tournament view** — clicking a standings row expands (or routes
   to) the player's list and record in that event:
   - The full decklist (main + side), grouped by card type — reuse the
     decklist component from
     [decklist-by-type](2026-09-27-decklist-by-type-requirements.md).
   - Their matches: opponent, opponent's archetype, result.

---

## Data we have / don't have

Checked against `src/models/tournament.py` on 2026-09-27:

| Need | Available? |
|---|---|
| Tournament name, date, source, link | ✅ `tournaments` |
| Standings: rank, W/L/D, player, archetype | ✅ `tournament_entries` (`rank`, `wins`, `losses`, `draws`) |
| Decklist per player | ✅ `deck_cards` (`entry_id`, `board`, `count`) |
| Per-player matches + opponent | ✅ `matches` (`entry_id`, `opponent_entry_id`, `result`, `pair_id`) |
| **Round number / match order** | ❌ not stored — `matches` has no round column. The raw source has rounds (see `docs/tournament_rounds_sample.json`); ingest drops them. |
| Top-8 bracket vs. Swiss split | ❌ same gap as above |

**Open question for planning:** do we show matches unordered (cheap, works
today), or add a `round` column to `matches` + backfill so we can show
"R1 … R8, QF, SF, F" (richer, requires an ingest + migration change)?

---

## Scope notes

- Needs new `MetaDataSource` methods (e.g. `getTournament(id)`,
  `getTournamentEntry(entryId)`) in `postgres.ts` + fixtures.
- Entry/deck queries are per-event, so small — but watch the correlated
  subquery trap documented in
  `docs/solutions/performance-issues/archetype-pages-correlated-subquery-latency.md`.
- Tournament IDs are UUIDs; decide whether URLs use the ID or a
  `date-name` slug (SEO + shareability).
- Player names: MTGO handles are public in the source data; no extra privacy
  concern beyond what we already publish, but don't build player profile
  pages as part of this.
