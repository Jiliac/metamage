import { ARCHETYPE_ENTRIES_CAP } from '@/datasource/types'
import { db } from '@/datasource/postgres/client'

// ---------------------------------------------------------------------------
// Raw SQL pieces (the vocabulary mirrors src/analysis + visualize/db.R).
// Each is a small factory so the query text stays parameterized ($n bound via
// postgres.js tagged templates) rather than interpolated, and each is typed
// with its row shape via postgres.js's generic `sql<Row[]>` so callers get
// typed rows without casts. Nothing here runs at import: `db()` is resolved
// when a factory is CALLED (see client.ts).
//
// Semantics shared by every window query:
//   * matches are counted from the ENTRY side only (each match row belongs to
//     one entry; the paired row is the opponent's copy) — same as the R
//     pipeline and src/analysis/meta.py;
//   * the window is inclusive on both ends: `t.date >= start` and
//     `t.date < end + 1 day`.
// ---------------------------------------------------------------------------

// ---- Row types --------------------------------------------------------------

export type FormatRow = { id: string; name: string }

export type ArchetypeRow = { id: string; name: string; color: string | null }

export type LatestWindowRow = {
  month_start: Date | string | null
  month_end: Date | string | null
}

export type KpiRow = { tournaments: number; entries: number; matches: number }

/** One player's aggregate record inside an archetype — a clustering unit. */
export type PlayerRow = {
  archetype_id: string
  player_id: string
  wins: number
  losses: number
  draws: number
  games: number
  /** This player's DISTINCT match-having entries in this archetype. Players
   *  are disjoint by player_id, so summing over an archetype's rows gives its
   *  COUNT(DISTINCT entry_id) over match-having entries. */
  entry_count: number
}

export type MatchupRow = {
  row_id: string
  col_id: string
  wins: number
  losses: number
  draws: number
}

export type CardAdoptionRow = {
  card_id: string
  name: string
  avg_count: number
  decks_playing: number
}

export type DeckCountRow = { decks: number }

export type TrendRow = {
  week_start: string
  decks: number
  wins: number
  losses: number
  draws: number
  field_decks: number
}

export type TournamentRow = {
  id: string
  name: string
  date: Date | string
  source: string
  link: string | null
  entries: number
}

export type SourceRow = { source: string; tournaments: number; entries: number }

export type MetaChangeRow = {
  date: Date | string
  change_type: string
  description: string | null
  set_code: string | null
}

// ---- Format + archetype lookups ---------------------------------------------

export const FORMATS_SQL = () => db()<FormatRow[]>`
  select id, name from formats order by name asc
`

export const FORMAT_ID_SQL = (formatName: string) => db()<FormatRow[]>`
  select id, name from formats where lower(name) = lower(${formatName}) limit 1
`

// The latest POPULATED calendar month for a format: the month of the newest
// tournament that has at least one match row, as [first day, last day]. This
// mirrors FixtureDataSource.getLatestWindow (windows are calendar months; the
// latest one with kpis.matches > 0 wins), so the landing page's
// empty-default fallback lands on ONE month, never the
// format's whole history. Both columns are NULL when the format has no
// match-having tournament at all (date_trunc(NULL) is NULL) → caller returns
// null. Format match is case-insensitive, consistent with FORMAT_ID_SQL.
//
// Parity expectation (unverified against the live DB): for a format whose
// newest match-having tournament is dated 2026-09-21, returns
// (2026-09-01, 2026-09-30).
export const LATEST_WINDOW_SQL = (formatName: string) => db()<
  LatestWindowRow[]
>`
  with latest as (
    select max(t.date) as newest
    from tournaments t
    join formats f on f.id = t.format_id
    where lower(f.name) = lower(${formatName})
      and exists (
        select 1
        from tournament_entries te
        join matches m on m.entry_id = te.id
        where te.tournament_id = t.id
      )
  )
  select date_trunc('month', newest)::date as month_start,
         (date_trunc('month', newest) + interval '1 month' - interval '1 day')::date as month_end
  from latest
`

export const ARCHETYPES_SQL = (formatId: string) => db()<ArchetypeRow[]>`
  select id, name, color from archetypes where format_id = ${formatId}
`

// Substring search over lowercase names; an empty query lists every archetype.
export const SEARCH_ARCHETYPES_SQL = (formatId: string, q: string) => db()<
  ArchetypeRow[]
>`
  select id, name, color from archetypes
  where format_id = ${formatId}
    and (
      ${q} = ''
      or lower(name) like ${'%' + q + '%'}
    )
  order by name asc
`

// Alias resolution (the MCP `add_archetype_alias` path): the URL slug with
// hyphens restored to spaces, matched against lowercase aliases.
export const ARCHETYPE_BY_ALIAS_SQL = (formatId: string, slug: string) => db()<
  ArchetypeRow[]
>`
  select a.id, a.name, a.color
  from archetype_aliases aa
  join archetypes a on a.id = aa.archetype_id
  where a.format_id = ${formatId}
    and lower(aa.alias) = ${slug.replace(/-/g, ' ')}
  limit 1
`

// ---- Window aggregates ------------------------------------------------------

// Window KPIs: tournaments / entries / one-sided match rows in the window.
// Entries = all entries; matches = match rows (an entry with no match rows
// still counts toward entries but contributes zero games).
export const KPI_SQL = (formatId: string, start: string, end: string) => db()<
  KpiRow[]
>`
  select
    count(distinct t.id)::int as tournaments,
    count(distinct te.id)::int as entries,
    count(m.id)::int as matches
  from tournaments t
  left join tournament_entries te on te.tournament_id = t.id
  left join matches m on m.entry_id = te.id
  where t.format_id = ${formatId}
    and t.date >= ${start}::timestamp
    and t.date < (${end}::date + interval '1 day')
`

// Per-player aggregate record per archetype in the window — the clustering
// input. One-sided counts (entry side), grouped by archetype + player.
// `entry_count` is that player's DISTINCT match-having entries in the
// archetype: counted over the SAME joined rows as the W/L/D, so an entry with
// no match rows never inflates it (fixtures count decks as
// COUNT(DISTINCT entry_id) over match-having entries; the earlier window
// function counted every window entry, including matchless ones, and drifted).
// Players are disjoint by player_id, so summing entry_count over an
// archetype's rows reconstructs its deck total exactly.
//
// No correlated subquery (a per-group (player, archetype) probe cost ~1.1 s on
// Neon for a 3-month Modern window); the distinct aggregate rides the same
// hash aggregate as the counts.
//
// Parity expectation (unverified against the live DB): for a player with
// entries e1 (2 matches) and e2 (0 matches) in one archetype, the row has
// games = 2 and entry_count = 1 (previously 2).
export const PLAYER_RECORDS_SQL = (
  formatId: string,
  start: string,
  end: string
) => db()<PlayerRow[]>`
  with entries as (
    select te.id, te.archetype_id, te.player_id
    from tournament_entries te
    join tournaments t on t.id = te.tournament_id
    where t.format_id = ${formatId}
      and t.date >= ${start}::timestamp
      and t.date < (${end}::date + interval '1 day')
  )
  select e.archetype_id, e.player_id,
         count(*) filter (where m.result = 'WIN')::int as wins,
         count(*) filter (where m.result = 'LOSS')::int as losses,
         count(*) filter (where m.result = 'DRAW')::int as draws,
         count(*)::int as games,
         count(distinct e.id)::int as entry_count
  from entries e
  join matches m on m.entry_id = e.id
  group by e.archetype_id, e.player_id
`

// Matchup cells in the R/fixture semantics: EVERY match contributes once to
// the (row = entry's archetype, col = opponent's archetype) cell, from its
// own entry side. No entry_id< dedupe filter here — that would split each
// pair's record across two cells (verified: rm→mbt one-sided W20/L35 vs the
// full-side W36/L59 that R and the fixtures expect). Reverse cells are the
// complement (W/L swapped, draws equal) — orientedPair() handles that.
export const MATCHUPS_SQL = (
  formatId: string,
  start: string,
  end: string
) => db()<MatchupRow[]>`
  select te.archetype_id as row_id, te2.archetype_id as col_id,
         count(*) filter (where m.result = 'WIN')::int as wins,
         count(*) filter (where m.result = 'LOSS')::int as losses,
         count(*) filter (where m.result = 'DRAW')::int as draws
  from tournaments t
  join tournament_entries te on te.tournament_id = t.id
  join matches m on m.entry_id = te.id
  join tournament_entries te2 on te2.id = m.opponent_entry_id
  where t.format_id = ${formatId}
    and t.date >= ${start}::timestamp
    and t.date < (${end}::date + interval '1 day')
  group by te.archetype_id, te2.archetype_id
`

// ---- Per-archetype detail ---------------------------------------------------

// Card adoption inside one archetype's decks. Names come through
// coalesce(display_name, name) (KTD11): the stored Scryfall display_name when
// the card is backfilled, else the lowercase DB name. Grouping by
// `dc.card_id, c.id` (the cards primary key) is what lets Postgres accept the
// coalesce — grouping by c.name would reject selecting c.display_name.
// avg_count averages the copy count over decks that play the card (mirrors
// the R `avg_copies`); decks_playing is distinct entries; presence_pct =
// decks_playing / the archetype's deck count.
export const CARD_ADOPTION_SQL = (
  formatId: string,
  start: string,
  end: string,
  archetypeId: string,
  board: string
) => db()<CardAdoptionRow[]>`
  select dc.card_id, coalesce(c.display_name, c.name) as name,
         avg(dc.count)::float8 as avg_count,
         count(distinct dc.entry_id)::int as decks_playing
  from deck_cards dc
  join cards c on c.id = dc.card_id
  join tournament_entries te on te.id = dc.entry_id
  join tournaments t on t.id = te.tournament_id
  where t.format_id = ${formatId}
    and t.date >= ${start}::timestamp
    and t.date < (${end}::date + interval '1 day')
    and te.archetype_id = ${archetypeId}
    and dc.board = ${board}
  group by dc.card_id, c.id
  order by decks_playing desc, name asc
`

// The archetype's DISTINCT entry count in the window — the presence_pct
// denominator for CARD_ADOPTION_SQL.
export const DECK_COUNT_SQL = (
  formatId: string,
  start: string,
  end: string,
  archetypeId: string
) => db()<DeckCountRow[]>`
  select count(distinct te.id)::int as decks
  from tournament_entries te
  join tournaments t on t.id = te.tournament_id
  where t.format_id = ${formatId}
    and t.date >= ${start}::timestamp
    and t.date < (${end}::date + interval '1 day')
    and te.archetype_id = ${archetypeId}
`

// Weekly trend for one archetype: Monday-start weeks (matches SQLite's
// `date('weekday 0', '-6 days')` == Postgres `date_trunc('week')`, verified on
// real rows), one-sided counts, plus the FORMAT-wide deck count per week for
// the presence denominator.
//
// The result is driven by `field` (every week the FORMAT had entries) so a
// week where the archetype had no matches still yields a point — decks and
// W/L/D coalesce to 0, and trendFor() maps games = 0 to `wr: null`, the chart
// gap the contract promises. Inside `arch`, matches are LEFT-joined and
// counted with count(m.id) so `decks` counts ALL archetype entries in the
// week — the same population `field_decks` counts — instead of match-having
// ones only (which biased presencePct low; the live DB has ~24k matchless
// entries). Mirrors the fixture generator, which emits explicit decks: 0
// weeks.
//
// Parity expectation (unverified against the live DB): a 4-week window where
// the archetype played in weeks 1, 2 and 4 returns 4 rows, week 3 having
// decks = 0, wins = losses = draws = 0 and the format's field_decks; for a
// week with 3 archetype entries of which 2 have matches, decks = 3 (was 2).
export const TREND_SQL = (
  formatId: string,
  start: string,
  end: string,
  archetypeId: string
) => db()<TrendRow[]>`
  with field as (
    select to_char(date_trunc('week', t.date), 'YYYY-MM-DD') as week_start,
           count(distinct te.id)::int as field_decks
    from tournaments t
    join tournament_entries te on te.tournament_id = t.id
    where t.format_id = ${formatId}
      and t.date >= ${start}::timestamp
      and t.date < (${end}::date + interval '1 day')
    group by 1
  ),
  arch as (
    select to_char(date_trunc('week', t.date), 'YYYY-MM-DD') as week_start,
           count(distinct te.id)::int as decks,
           count(m.id) filter (where m.result = 'WIN')::int as wins,
           count(m.id) filter (where m.result = 'LOSS')::int as losses,
           count(m.id) filter (where m.result = 'DRAW')::int as draws
    from tournaments t
    join tournament_entries te on te.tournament_id = t.id
    left join matches m on m.entry_id = te.id
    where t.format_id = ${formatId}
      and t.date >= ${start}::timestamp
      and t.date < (${end}::date + interval '1 day')
      and te.archetype_id = ${archetypeId}
    group by 1
  )
  select f.week_start,
         coalesce(a.decks, 0)::int as decks,
         coalesce(a.wins, 0)::int as wins,
         coalesce(a.losses, 0)::int as losses,
         coalesce(a.draws, 0)::int as draws,
         f.field_decks
  from field f
  left join arch a on a.week_start = f.week_start
  order by f.week_start
`

// ---- Tournaments + sources + format metadata --------------------------------

// Tournaments in the window with their entry counts. Entry counts come from
// one pre-aggregated `tc` CTE (scoped to the window's tournaments) that is
// LEFT-joined and coalesced, instead of a correlated scalar subquery per
// tournament row (the shape docs/solutions/performance-issues names as the
// pattern to avoid on Neon). Same rows, same counts: a tournament with no
// entries still appears with entries = 0.
//
// Parity expectation (unverified against the live DB): identical (id, entries)
// pairs and order to the previous correlated form for any window.
export const TOURNAMENTS_SQL = (
  formatId: string,
  start: string,
  end: string
) => db()<TournamentRow[]>`
  with win as (
    select t.id, t.name, t.date, t.source, t.link
    from tournaments t
    where t.format_id = ${formatId}
      and t.date >= ${start}::timestamp
      and t.date < (${end}::date + interval '1 day')
  ),
  tc as (
    select te.tournament_id, count(*)::int as entries
    from tournament_entries te
    join win on win.id = te.tournament_id
    group by te.tournament_id
  )
  select win.id, win.name, win.date, win.source, win.link,
         coalesce(tc.entries, 0)::int as entries
  from win
  left join tc on tc.tournament_id = win.id
  order by win.date desc, win.name asc
`

// Per-source tournament + entry totals in the window; same `tc` hoist as
// TOURNAMENTS_SQL (sum of per-tournament entry counts per source).
//
// Parity expectation (unverified against the live DB): identical
// (source, tournaments, entries) rows to the previous correlated form.
export const SOURCES_SQL = (
  formatId: string,
  start: string,
  end: string
) => db()<SourceRow[]>`
  with win as (
    select t.id, t.source
    from tournaments t
    where t.format_id = ${formatId}
      and t.date >= ${start}::timestamp
      and t.date < (${end}::date + interval '1 day')
  ),
  tc as (
    select te.tournament_id, count(*)::int as entries
    from tournament_entries te
    join win on win.id = te.tournament_id
    group by te.tournament_id
  )
  select win.source,
         count(*)::int as tournaments,
         coalesce(sum(tc.entries), 0)::int as entries
  from win
  left join tc on tc.tournament_id = win.id
  group by win.source
  order by entries desc
`

export const META_CHANGES_SQL = (formatId: string) => db()<MetaChangeRow[]>`
  select date, change_type, description, set_code
  from meta_changes
  where format_id = ${formatId}
  order by date asc
`

// ---- Decklists tab (plan U3) -------------------------------------------------

export type EntrySummaryRow = {
  id: string
  entry_rank: number
  wins: number
  losses: number
  draws: number
  decklist_url: string | null
  handle: string
  tournament_id: string
  tournament_name: string
  date: Date | string
  link: string | null
  source: string
  has_cards: boolean
}

export type EntryListRow = EntrySummaryRow & { total: number }

// The archetype's window entries for the recent-decks column, newest first,
// capped at ARCHETYPE_ENTRIES_CAP with the uncapped total (KTD7, R9/R12).
//
// `has_cards` comes from a grouped join on deck_cards (the `carded` CTE has at
// most one row per entry, so the left join preserves row shape) — NOT a
// correlated per-row subquery, the shape
// docs/solutions/performance-issues/archetype-pages-correlated-subquery-latency.md
// calls out as the Neon latency trap. The `total` CTE counts the same window
// set once, so R12's "Showing the newest N of total" never needs a second
// round trip.
//
// Parity expectation (unverified against the live DB): for a window where the
// archetype has 2,450 entries, total = 2450 and at most 2,000 rows come back,
// ordered by date desc with same-event rows adjacent (tournament name, rank,
// handle) so the column can group by event without re-sorting.
export const ARCHETYPE_ENTRIES_SQL = (
  formatId: string,
  start: string,
  end: string,
  archetypeId: string
) => db()<EntryListRow[]>`
  with win as (
    select te.id, te.rank as entry_rank, te.wins, te.losses, te.draws,
           te.decklist_url, te.player_id,
           t.id as tournament_id, t.name as tournament_name, t.date, t.link,
           t.source
    from tournament_entries te
    join tournaments t on t.id = te.tournament_id
    where t.format_id = ${formatId}
      and t.date >= ${start}::timestamp
      and t.date < (${end}::date + interval '1 day')
      and te.archetype_id = ${archetypeId}
  ),
  carded as (
    select dc.entry_id
    from deck_cards dc
    join win on win.id = dc.entry_id
    group by dc.entry_id
  ),
  total as (
    select count(*)::int as total from win
  )
  select win.id, win.entry_rank, win.wins, win.losses, win.draws,
         win.decklist_url, win.tournament_id, win.tournament_name, win.date,
         win.link, win.source,
         p.handle,
         (carded.entry_id is not null) as has_cards,
         total.total
  from win
  join players p on p.id = win.player_id
  left join carded on carded.entry_id = win.id
  cross join total
  order by win.date desc, win.tournament_name asc, win.entry_rank asc,
           p.handle asc
  limit ${ARCHETYPE_ENTRIES_CAP}
`

// One entry's header (tournament, player, rank, record, URLs) plus its
// deck_cards joined to cards, carrying the KTD1 card data. Keyed on the entry
// id alone — entry ids are globally unique UUIDs, so no format filter: the
// row's `format_name` (formats.name is the lowercase slug) and the CURRENT
// archetype are what the page reads to redirect per KTD6 after a
// reclassification.
//
// An entry with zero deck_cards comes back as one row with null card columns
// (the left joins pad it) — mapDeckRows renders that as header + empty lists,
// the "no list published" deck of R9.
export type DeckRow = Omit<EntrySummaryRow, 'has_cards'> & {
  format_name: string
  archetype_name: string
  archetype_color: string | null
  // card columns — null on the padding row of a cardless entry
  card_id: string | null
  count: number | null
  board: string | null
  name: string | null
  display_name: string | null
  type_line: string | null
  mana_cost: string | null
  cmc: number | null
  image_normal: string | null
  image_back: string | null
  scryfall_uri: string | null
}

export const DECK_SQL = (entryId: string) => db()<DeckRow[]>`
  with header as (
    select te.id, te.rank as entry_rank, te.wins, te.losses, te.draws,
           te.decklist_url, te.player_id,
           t.id as tournament_id, t.name as tournament_name, t.date, t.link,
           t.source, f.name as format_name, p.handle,
           a.name as archetype_name, a.color as archetype_color
    from tournament_entries te
    join tournaments t on t.id = te.tournament_id
    join formats f on f.id = t.format_id
    join players p on p.id = te.player_id
    join archetypes a on a.id = te.archetype_id
    where te.id = ${entryId}
  )
  select h.id, h.entry_rank, h.wins, h.losses, h.draws, h.decklist_url,
         h.tournament_id, h.tournament_name, h.date, h.link, h.source,
         h.format_name, h.handle, h.archetype_name, h.archetype_color,
         dc.card_id, dc.count, dc.board,
         c.name, c.display_name, c.type_line, c.mana_cost, c.cmc,
         c.image_normal, c.image_back, c.scryfall_uri
  from header h
  left join deck_cards dc on dc.entry_id = h.id
  left join cards c on c.id = dc.card_id
  order by dc.board asc, dc.count desc,
           coalesce(c.display_name, c.name) asc
`
