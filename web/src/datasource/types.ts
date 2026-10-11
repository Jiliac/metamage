// ---- Branded primitives (cheap safety on the load-bearing keys) ----
export type FormatSlug = string & { readonly __brand: 'FormatSlug' }
export type ArchetypeSlug = string & { readonly __brand: 'ArchetypeSlug' }
export type IsoDate = string & { readonly __brand: 'IsoDate' } // 'YYYY-MM-DD'

// ---- Table sort key (the sortable column on the MetaTable) ----
// `presence` → presenceRank/share, `wrlo` → clustered wrLo (canonical moat).
// Default is `presence`. (`tier` was dropped with the table's Tier column; old
// `?sort=tier` URLs fall back to the default in parseSort.)
export type MetaSort = 'presence' | 'wrlo'

/** Where the events were played: Magic Online, tabletop, or both. */
export type Platform = 'all' | 'online' | 'paper'

// ---- The lens: single source of truth, parsed from searchParams ----
export type MetaQuery = {
  format: FormatSlug
  start: IsoDate
  end: IsoDate // inclusive both ends, matches t.date filter
  topN: number // default 20
  minMatches: number // default 80
  includeArchetypes: ArchetypeSlug[] // forced-in small archetypes
  hideBuckets: boolean // drop unknown/conflict
  weight: 'match' | 'entry' // presence weighting
  platform: Platform // event filter by source (see @/datasource/platform)
}

export type FormatDTO = {
  slug: FormatSlug
  name: string // display, e.g. 'Duel Commander'
  displayName: string // 'DC' for duel-commander, else name
}

export type WindowKpisDTO = {
  tournaments: number
  entries: number
  matches: number
}

export type CiMethod = 'clustered' | 'wilson' | 'binomial'

// The canonical archetype row: presence ⋈ wr ⋈ players ⋈ tier.
export type ArchetypeRowDTO = {
  slug: ArchetypeSlug
  name: string
  color: string | null // guild code e.g. 'BR', part of name too
  // identity — the archetype's signature card (Scryfall art_crop). Null for
  // formats without a seeded mapping → UI falls back to a mana gradient (§9).
  art: { cardName: string; artCropUrl: string | null } | null
  // presence — MATCH-weighted by default; both counts exposed
  matches: number // COUNT(matches)
  decks: number // COUNT(DISTINCT entry_id)
  share: number // 0..1, full-meta denom, pre-filter
  presenceRank: number // 1 = most played (numbered-dot index)
  // record
  wins: number
  losses: number
  draws: number
  games: number // W+L+D
  points: number // W + 0.5D
  // two WR formulas — expose both, never pick silently
  wr: number // CANONICAL (charts): (W+0.5D)/games
  wrExclDraws: number // (marav): W/(W+L)
  // confidence
  wrLo: number
  wrHi: number // 95% CI, clamped [0,1]
  ciMethod: CiMethod // so UI can badge low-confidence rows
  players: number // COUNT(DISTINCT player_id)
  // ranking
  tier: 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | null // std-dev bands over wrLo
  isBucket: boolean // true for unknown/conflict → de-emphasize
}

export type MetaReportDTO = {
  window: { start: IsoDate; end: IsoDate }
  kpis: WindowKpisDTO
  rows: ArchetypeRowDTO[] // sorted by MetaQuery.sort
  other: { share: number; matches: number } | null // collapsed tail
  /** The honest-buckets strip's figures, computed over the FULL intrinsic
   *  field — never topN-capped — so sub-floor archetypes ranked past the topN
   *  are still counted and the bucket shares denominate against the whole
   *  window. */
  floor: {
    /** Non-bucket archetypes under the match floor that no `add=` rescued. */
    belowFloorCount: number
    /** Window share of the Unknown/Conflict buckets; null when absent. */
    unknownShare: number | null
    conflictShare: number | null
  }
  generatedAt: string
}

export type MatchupCellDTO = {
  rowSlug: ArchetypeSlug
  colSlug: ArchetypeSlug
  rowName: string
  colName: string
  wins: number
  losses: number
  draws: number
  games: number
  wr: number // row-vs-col (W+0.5D)/games
  ciLow: number
  ciHigh: number
  reliability: number // min(1, games/50)
  lowN: boolean // games < 5 → render '–'
  ciCrosses50: boolean
  isMirror: boolean // row==col → blanked
}

export type MatrixOrderEntryDTO = {
  slug: ArchetypeSlug
  name: string
  color: string | null
  globalWr: number | null // vs whole meta (left WINRATE column)
  share: number
  matches: number
  presenceRank: number // dense identity rank (§9 rule 3), shared with the table
}

export type MatrixDTO = {
  window: { start: IsoDate; end: IsoDate }
  order: MatrixOrderEntryDTO[]
  cells: MatchupCellDTO[] // FULL grid: missing pairs zero-filled, mirrors present
}

export type CardAdoptionDTO = {
  cardId: string
  // KTD11: the stored Scryfall display_name when the card is backfilled, else
  // the lowercase DB name — title-case only that fallback at render.
  name: string
  // True when `name` is the stored display_name (already proper-cased); the
  // renderer must not re-case it ("Will-o'-the-Wisp" would get mangled).
  hasDisplayName: boolean
  board: 'MAIN' | 'SIDE'
  avgCount: number
  decksPlaying: number
  presencePct: number
}

export type TrendPointDTO = {
  weekStart: IsoDate
  presencePct: number
  wr: number | null // null on zero-game weeks (gap)
  games: number
}

export type ArchetypeDetailDTO = {
  archetype: { slug: ArchetypeSlug; name: string; color: string | null }
  window: { start: IsoDate; end: IsoDate }
  kpis: WindowKpisDTO
  summary: ArchetypeRowDTO
  mainCards: CardAdoptionDTO[]
  sideCards: CardAdoptionDTO[]
  matchups: MatchupCellDTO[] // this archetype's row vs all
  trends: TrendPointDTO[]
}

export type MetaChangeDTO = {
  date: IsoDate
  type: 'BAN' | 'SET_RELEASE'
  description: string
  setCode?: string
}

export type TournamentDTO = {
  id: string
  name: string
  date: IsoDate
  /** The event's own format — lets the all-formats list link each row. */
  format: FormatSlug
  source: 'MTGO' | 'MELEE' | 'CARDSREALM' | 'OTHER'
  link?: string
  entries: number
}

/** One player's line in an event's standings. */
export type StandingDTO = {
  entryId: string
  /** Final placing; null when the source publishes none (Melee, leagues). */
  rank: number | null
  wins: number
  losses: number
  draws: number
  player: string
  archetype: {
    slug: ArchetypeSlug
    name: string
    color: string | null
    isBucket: boolean
  }
  decklistUrl?: string
  /** True when the entry has stored deck cards (a viewable list). */
  hasDecklist: boolean
}

/** Event-scoped matchup record, from the row archetype's entry side (same
 *  semantics as the window MATCHUPS_SQL: every match counted once per side). */
export type EventMatchupDTO = {
  rowSlug: ArchetypeSlug
  colSlug: ArchetypeSlug
  wins: number
  losses: number
  draws: number
}

export type TournamentDetailDTO = {
  tournament: TournamentDTO
  /** Unsorted; order with `sortStandings` (@/lib/events). */
  standings: StandingDTO[]
  matchups: EventMatchupDTO[]
}

export type SourceDTO = {
  source: TournamentDTO['source']
  tournaments: number
  entries: number
}

// ---- Decklists tab (the archetype page's featured deck + recent column) ----

/** R12: the recent-decks list loads the newest ARCHETYPE_ENTRIES_CAP window
 *  entries; past the cap it ends with "Showing the newest N of total". */
export const ARCHETYPE_ENTRIES_CAP = 2000

/** One recent deck of an archetype — the row the recent-decks column renders
 *  and the input the featured pick (KTD4) scores. Light on purpose: no cards. */
export type DeckSummaryDTO = {
  id: string
  player: string
  /** MTGO placing; Melee/unranked rows store 0 in the DB → null. KTD4 sorts
   *  null (0) last. */
  rank: number | null
  wins: number
  losses: number
  draws: number
  /** The source decklist URL, or null when none was published — the header
   *  then falls back to `event.link` (R2). */
  decklistUrl: string | null
  event: {
    id: string
    name: string
    date: IsoDate
    link: string | null
    source: TournamentDTO['source']
  }
  /** Has deck_cards rows: false renders "no list published" (R9) and excludes
   *  the entry from featured-deck candidates (KTD4). */
  hasCards: boolean
}

/** The archetype's window entries for the recent-decks column (KTD7
 *  `getArchetypeEntries`). Newest first, capped, with the uncapped total. */
export type ArchetypeEntriesDTO = {
  /** Every window entry of the archetype — R12's N past the cap. */
  total: number
  /** Newest first, at most ARCHETYPE_ENTRIES_CAP rows. */
  entries: DeckSummaryDTO[]
}

/** One card row of a decklist with the persisted KTD1 card data. */
export type DeckCardDTO = {
  cardId: string
  /** The stored display_name, falling back to the raw DB name (KTD11). */
  name: string
  board: 'MAIN' | 'SIDE'
  count: number
  // KTD1 card data — null when the card has not been backfilled yet (R5
  // renders those in the Other group with a title-cased name, R7 as text).
  typeLine: string | null
  manaCost: string | null
  cmc: number | null
  imageNormal: string | null
  imageBack: string | null // back face; null on single-faced cards
  scryfallUri: string | null
}

/** One entry's full decklist (KTD7 `getDeck`). `format` and `archetype` are
 *  the entry's CURRENT values — after a reclassification they may differ from
 *  the page's, which is what the KTD6 redirect reads. */
export type DeckDTO = {
  format: FormatSlug
  archetype: { slug: ArchetypeSlug; name: string; color: string | null }
  entry: DeckSummaryDTO
  /** Maindeck rows (R3 groups them by type). */
  main: DeckCardDTO[]
  /** Sideboard rows, flat (labelled "Commander" in Duel Commander, R6). */
  side: DeckCardDTO[]
}

export type ArchetypeRef = { slug: ArchetypeSlug; name: string }

export interface MetaDataSource {
  listFormats(): Promise<FormatDTO[]>
  /** The most-recent window (by end date) that actually has data, or null.
   *  Lets the default landing fall back to the latest populated window instead
   *  of blanking once the live-clock month has no seeded/ingested window.
   *  `platform` restricts "has data" to that platform's events. */
  getLatestWindow(
    format: FormatSlug,
    platform?: Platform
  ): Promise<{ start: IsoDate; end: IsoDate } | null>
  getMetaReport(q: MetaQuery): Promise<MetaReportDTO>
  getArchetypeDetail(
    q: MetaQuery & { slug: ArchetypeSlug }
  ): Promise<ArchetypeDetailDTO | null>
  getArchetypeCards(
    q: MetaQuery & { slug: ArchetypeSlug; board: 'MAIN' | 'SIDE' }
  ): Promise<CardAdoptionDTO[]>
  getArchetypeTrends(
    q: MetaQuery & { slug: ArchetypeSlug }
  ): Promise<TrendPointDTO[]>
  /** The archetype's window entries for the recent-decks column, newest
   *  first, capped at ARCHETYPE_ENTRIES_CAP with the uncapped total (KTD7,
   *  R9/R12). Keyed on the window like the other archetype reads. */
  getArchetypeEntries(
    q: MetaQuery & { slug: ArchetypeSlug }
  ): Promise<ArchetypeEntriesDTO>
  /** One entry's full decklist by id, ignoring the window (KTD7). Entry ids
   *  are globally unique UUIDs, so `format` rides along for caller context
   *  only and the DTO carries the entry's current archetype + format for the
   *  KTD6 redirect. Unknown id → null. */
  getDeck(q: { format?: FormatSlug; entryId: string }): Promise<DeckDTO | null>
  getMatchupMatrix(q: MetaQuery & { matrixTopN: number }): Promise<MatrixDTO>
  getMatchup(
    q: MetaQuery & { a: ArchetypeSlug; b: ArchetypeSlug }
  ): Promise<MatchupCellDTO | null>
  getFormatMetaChanges(format: FormatSlug): Promise<MetaChangeDTO[]>
  /** Events in the window. `q.format === ALL_FORMATS` lists every format. */
  getTournaments(q: MetaQuery): Promise<TournamentDTO[]>
  getSources(q: MetaQuery): Promise<SourceDTO[]>
  /** One event's standings + matchups, keyed on id only (window-free). */
  getTournament(id: string): Promise<TournamentDetailDTO | null>
  // slug discipline + small-archetype adder
  searchArchetypes(format: FormatSlug, query: string): Promise<ArchetypeRef[]>
  resolveSlug(
    format: FormatSlug,
    slug: ArchetypeSlug
  ): Promise<ArchetypeRef | null>
}
