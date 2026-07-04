// ---- Branded primitives (cheap safety on the load-bearing keys) ----
export type FormatSlug = string & { readonly __brand: 'FormatSlug' }
export type ArchetypeSlug = string & { readonly __brand: 'ArchetypeSlug' }
export type IsoDate = string & { readonly __brand: 'IsoDate' } // 'YYYY-MM-DD'

// ---- Table sort key (the sortable column on the MetaTable) ----
// `presence` → presenceRank/share, `wrlo` → clustered wrLo (canonical moat),
// `tier` → std-dev tier band. Default is `presence`.
export type MetaSort = 'presence' | 'wrlo' | 'tier'

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
}

export type MatrixDTO = {
  window: { start: IsoDate; end: IsoDate }
  order: MatrixOrderEntryDTO[]
  cells: MatchupCellDTO[] // FULL grid: missing pairs zero-filled, mirrors present
}

export type CardAdoptionDTO = {
  cardId: string
  name: string // lowercase in DB — title-case at render
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
  source: 'MTGO' | 'MELEE' | 'CARDSREALM' | 'OTHER'
  link?: string
  entries: number
}

export type SourceDTO = {
  source: TournamentDTO['source']
  tournaments: number
  entries: number
}

export type ArchetypeRef = { slug: ArchetypeSlug; name: string }

export interface MetaDataSource {
  listFormats(): Promise<FormatDTO[]>
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
  getMatchupMatrix(q: MetaQuery & { matrixTopN: number }): Promise<MatrixDTO>
  getMatchup(
    q: MetaQuery & { a: ArchetypeSlug; b: ArchetypeSlug }
  ): Promise<MatchupCellDTO | null>
  getFormatMetaChanges(format: FormatSlug): Promise<MetaChangeDTO[]>
  getTournaments(q: MetaQuery): Promise<TournamentDTO[]>
  getSources(q: MetaQuery): Promise<SourceDTO[]>
  // slug discipline + small-archetype adder
  searchArchetypes(format: FormatSlug, query: string): Promise<ArchetypeRef[]>
  resolveSlug(
    format: FormatSlug,
    slug: ArchetypeSlug
  ): Promise<ArchetypeRef | null>
}
