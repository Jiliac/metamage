---
title: Archetype detail pages 5x slow — correlated per-row subquery in PLAYER_RECORDS_SQL
date: 2026-09-27
category: performance-issues
module: web
problem_type: performance_issue
component: frontend
severity: medium
symptoms:
  - "Archetype detail pages rendered in ~2.7s cold against Neon live data (all other routes < 0.4s)"
  - "Raw PLAYER_RECORDS_SQL on Neon, 3-month Modern window: ~1.1-1.3s per execution, stable across warm runs"
  - "User-visible as 'changing time interval / clicking an archetype takes a while' with no loading feedback"
root_cause: logic_error
resolution_type: code_fix
framework_version: "next.js 15.5.2"
related_components:
  - database
tags:
  [
    postgres,
    window-function,
    correlated-subquery,
    query-performance,
    nextjs,
    datasource,
    neon,
    archetype,
  ]
---

# Archetype detail pages 5x slow — correlated per-row subquery in PLAYER_RECORDS_SQL

## Problem

Archetype detail pages on the metamage web explorer (Next.js App Router backed by `PostgresDataSource` against Neon serverless Postgres) rendered in ~2.7 s cold while every other route stayed sub-second. The cause was `PLAYER_RECORDS_SQL` in `web/src/datasource/postgres.ts`, which computed each group row's `entry_count` with a correlated subquery — one re-probe of `tournament_entries` per (archetype, player) output row.

## Symptoms

- Archetype detail pages: **~2.7 s cold** (first render, uncached); warm routes all < 0.4 s.
- Raw `PLAYER_RECORDS_SQL` timing on Neon (3-month Modern window, 7,006 output rows): **~1.1–1.3 s**, stable across warm runs.
- Measured with `curl -o /dev/null -w '%{time_total}'` for the page and direct driver queries for the SQL; `EXPLAIN ANALYZE` showed the per-row subplan dominating the plan.

## What Didn't Work

- **Index tweaks** — `tournament_entries` already carries the right indexes (`player_id`, `(tournament_id, player_id)`, `archetype_id`); the problem is _how many times_ the probe runs, not how fast one probe runs.
- **Caching / `revalidate`** — `revalidate = 3600` on the page (`web/src/app/meta/[format]/archetype/[slug]/page.tsx:51`) masks repeat visits only; every cold regeneration still pays the full query cost. (Session history note: this fix explicitly rejected "add a spinner and move on" — the spinner shipped too, but the real fix is at the SQL level.)
- **A CTE rewrite without the window function** — a plain `count(*)` CTE grouped by `(player_id, archetype_id)` re-scanned the CTE per row and measured _slower_ (~8.4 s once) than the original; only the `count(*) OVER (PARTITION BY ...)` window form eliminates the per-row work.

## Solution

Rewrite `PLAYER_RECORDS_SQL` as a single pass: filter entries once in a CTE, compute the per-(player, archetype) count with a window function in a second CTE, then join matches and group once. Present in the current tree at `web/src/datasource/postgres.ts:355-379` (the comment block at `:344-353` documents the semantics and records this fix):

```ts
const PLAYER_RECORDS_SQL = (formatId, start, end) => sql`
  with entries as (
    select te.id, te.archetype_id, te.player_id
    from tournament_entries te
    join tournaments t on t.id = te.tournament_id
    where t.format_id = ${formatId}
      and t.date >= ${start}::timestamp
      and t.date < (${end}::date + interval '1 day')
  ),
  counted as (
    select e.*, count(*) over (partition by e.player_id, e.archetype_id) as entry_count
    from entries e
  )
  select c.archetype_id, c.player_id,
         count(*) filter (where m.result = 'WIN')::int as wins,
         count(*) filter (where m.result = 'LOSS')::int as losses,
         count(*) filter (where m.result = 'DRAW')::int as draws,
         count(*)::int as games,
         max(c.entry_count)::int as entry_count
  from counted c
  join matches m on m.entry_id = c.id
  group by c.archetype_id, c.player_id
`;
```

Before (correlated form, same semantics):

```sql
select te.archetype_id, te.player_id,
       count(*) filter (where m.result = 'WIN')::int as wins,
       ...
       (select count(*)::int
        from tournament_entries te2
        where te2.player_id = te.player_id
          and te2.archetype_id = te.archetype_id
          and exists (... format/date filters re-evaluated per row ...)
          and exists (select 1 from matches m2 where m2.entry_id = te2.id)
       )::int as entry_count
from tournament_entries te
join tournaments t on t.id = te.tournament_id
join matches m on m.entry_id = te.id
where t.format_id = ${formatId} and t.date >= ... and t.date < ...
group by te.archetype_id, te.player_id
```

Call path unchanged: `web/src/app/meta/[format]/archetype/[slug]/page.tsx` → `PostgresDataSource.getArchetypeDetail` → `playerRecords` → `PLAYER_RECORDS_SQL`.

**Measured results** (Neon, 3-month Modern window):

- Raw query: correlated ~1.1–1.3 s → window form ~0.4–0.6 s.
- Archetype page cold: **2.7 s → 0.52 s**; all routes < 0.6 s warm.
- Parity: **identical 7,006 rows and sums**, verified by row counts and the R-pipeline parity checks before commit.

## Why This Works

- The window `count(*) over (partition by e.player_id, e.archetype_id)` computes the per-(player, archetype) entry total **once** over the filtered entry set — O(n) over ~7k entries — instead of O(groups × probe cost), which on high-RTT serverless Postgres is the difference between ~1.2 s and ~0.45 s for the raw query and 2.7 s → 0.52 s for the page.
- `max(c.entry_count)::int` after the join+group is safe because `entry_count` is constant within each `(player_id, archetype_id)` partition; every row of a partition carries the same value, and the group aggregates collapse it to one copy.
- The comment block above the SQL pins the semantic contract that makes the rewrite valid: the window `entry_count` is the archetype's DISTINCT entry total restricted to match-having entries (matching the fixtures' `COUNT(DISTINCT entry_id)` deck counting), and players are disjoint by `player_id`, so summing per-player `entry_count` over an archetype reconstructs its deck total exactly. A rewrite that didn't preserve this contract would silently change the `decks` KPI.

## Prevention

- **On serverless Postgres with high RTT (Neon et al.), avoid per-row correlated subqueries that re-probe indexed tables.** Each output row pays a fresh index probe with round-trip-amplified latency. Pre-aggregate instead: window functions (`count(*) over (partition by …)`) or a materialized CTE compute the aggregate once over the filtered set.
- **Treat a scalar subquery in the SELECT list that references outer columns as a smell.** Hoist it into a CTE partitioned by the correlation keys; when grouping, recover the per-partition constant with `max(...)`/`min(...)`.
- **Measure both layers before/after**: raw query timing (`EXPLAIN ANALYZE` against the real host) plus end-to-end page timing (`curl -w '%{time_total}'` on a cold cache). A raw-query win that doesn't move page cold time means the bottleneck was elsewhere.
- **Prove parity, not just speed** when replacing an aggregate formulation: assert identical row counts and sums. Window functions and correlated subqueries can silently differ on ties, partitions, or filter placement (this session's sibling bugs — decks undercounting from per-player rows, matchups split across orientations — were exactly such parity failures).
- **Document query semantics at the definition site**: the `PLAYER_RECORDS_SQL` comment block carries the one-sided-count contract and the deck-count reasoning; a future rewrite inherits the invariant, not just the SQL.
- **Don't reach for caching to fix a slow query** — `revalidate` hides cold-path cost from repeat visitors only; fix the query first, cache second.

## Related

- `docs/plans/2026-07-04-001-feat-tournament-db-postgres-migration-plan.md` — the Postgres migration and read-path design this datasource layer came from
- `web/README.md` — datasource layer architecture (`getDataSource()` singleton, `MetaDataSource` frozen contract, `unstable_cache` wrapper)
- Fixed on branch `feat/postgres-web-read-path` (local, unmerged as of this writing) in the commit titled "feat(web): live-data UI fixes — art, casing, order, spinners, matchup sort"; the SHA may be rewritten on merge, so locate by message.
