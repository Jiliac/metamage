import type {
  ArchetypeDetailDTO,
  ArchetypeRef,
  ArchetypeRowDTO,
  ArchetypeSlug,
  CardAdoptionDTO,
  FormatDTO,
  FormatSlug,
  IsoDate,
  MatchupCellDTO,
  MatrixDTO,
  MatrixOrderEntryDTO,
  MetaChangeDTO,
  MetaDataSource,
  MetaQuery,
  MetaReportDTO,
  SourceDTO,
  TournamentDTO,
  TrendPointDTO,
  WindowKpisDTO,
} from '@/datasource/types'
import { parseSort, type SearchParamsInput } from '@/lib/params'
import type { MetaSort } from '@/datasource/types'
import { winrateCi, wr as wrOf, wrExclDraws, type WLD } from '@/lib/stats'
import { sortFormats } from '@/datasource/format-order'
import {
  DEFAULT_SORT,
  buildCell,
  presenceRankMap,
  selectReportRows,
  weightOf,
  type IntrinsicRow,
} from '@/datasource/derive'
import rawDb from '@/datasource/fixtures/data/db.json'

// ---------------------------------------------------------------------------
// FixtureDataSource — the read-path firewall (blueprint §3, §5). It loads the
// committed, seeded RAW-COUNTS fixture DB (per-player W/L/D for clustering; per
// unordered-pair matchup W/L/D) and derives EVERY stat through `@/lib/stats`, so
// the fixture backend and the Postgres backend can never disagree on the
// CI/tier math. All selection (topN / minMatches / includeArchetypes /
// hideBuckets / weight / sort) runs through `@/datasource/derive`, the same
// pure pipeline the Postgres backend feeds its SQL aggregates into. Never
// imports a DB client; pages import only `getDataSource()` (see index.ts).
// ---------------------------------------------------------------------------

// ---- Raw fixture schema (produced by scripts/gen-fixtures.ts) --------------
// Shared with the generator so a fixture that drifts from this shape fails tsc.

/** One player's aggregate record inside an archetype — a clustering unit. */
export type RawPlayer = { p: string; w: number; l: number; d: number }

/** Per-week aggregate for an archetype (drives the trend chart). */
export type RawTrendWeek = {
  weekStart: string
  w: number
  l: number
  d: number
  decks: number
  /** Total field decks that week — presence% denominator. */
  fieldDecks: number
}

/** Card adoption inside an archetype's decks (names lowercase, as in the DB). */
export type RawCard = {
  cardId: string
  name: string
  avgCount: number
  decksPlaying: number
  presencePct: number
}

/** One archetype's raw counts for a window. */
export type RawArchetype = {
  slug: string
  name: string
  color: string | null
  isBucket: boolean
  art: { cardName: string; artCropUrl: string | null } | null
  decks: number
  /** Per-player records; sum → the archetype's W/L/D, count → `players`. */
  players: RawPlayer[]
  mainCards: RawCard[]
  sideCards: RawCard[]
  trend: RawTrendWeek[]
}

/** One unordered matchup pair (a's record vs b); reverse derived by swapping. */
export type RawMatchup = {
  a: string
  b: string
  w: number
  l: number
  d: number
}

export type RawTournament = {
  id: string
  name: string
  date: string
  source: TournamentDTO['source']
  link?: string
  entries: number
}

export type RawWindow = {
  start: string
  end: string
  kpis: WindowKpisDTO
  archetypes: RawArchetype[]
  matchups: RawMatchup[]
  tournaments: RawTournament[]
}

export type RawFormat = {
  slug: string
  name: string
  displayName: string
  metaChanges: MetaChangeDTO[]
  /** Optional stale-slug redirects (e.g. a renamed archetype). */
  aliases?: Record<string, string>
  windows: RawWindow[]
}

export type RawDb = {
  generatedAt: string
  formats: RawFormat[]
}

const db = rawDb as unknown as RawDb

// ---- Small helpers ---------------------------------------------------------

const asSlug = (s: string) => s as ArchetypeSlug
const asIso = (s: string) => s as IsoDate

function windowKey(start: string, end: string): string {
  return `${start}_${end}`
}

function findFormat(format: string): RawFormat | undefined {
  return db.formats.find(f => f.slug === format)
}

function findWindow(
  format: string,
  q: {
    start: string
    end: string
  }
): RawWindow | undefined {
  const f = findFormat(format)
  if (!f) return undefined
  const key = windowKey(q.start, q.end)
  return f.windows.find(w => windowKey(w.start, w.end) === key)
}

function sumRecord(players: RawPlayer[]): {
  wins: number
  losses: number
  draws: number
} {
  let wins = 0
  let losses = 0
  let draws = 0
  for (const p of players) {
    wins += p.w
    losses += p.l
    draws += p.d
  }
  return { wins, losses, draws }
}

function clustersOf(players: RawPlayer[]): WLD[] {
  return players.map(p => ({ wins: p.w, losses: p.l, draws: p.d }))
}

// ---- Row derivation (the one place stats.ts is applied to archetypes) ------

function deriveIntrinsic(
  raw: RawArchetype,
  denomMatches: number
): IntrinsicRow {
  const { wins, losses, draws } = sumRecord(raw.players)
  const games = wins + losses + draws
  const clusters = clustersOf(raw.players)
  const ci = winrateCi(clusters)
  const activePlayers = raw.players.filter(p => p.w + p.l + p.d > 0).length
  return {
    slug: asSlug(raw.slug),
    name: raw.name,
    color: raw.color,
    art: raw.art,
    matches: games,
    decks: raw.decks,
    share: denomMatches > 0 ? games / denomMatches : 0,
    wins,
    losses,
    draws,
    games,
    points: wins + 0.5 * draws,
    wr: wrOf(wins, losses, draws),
    wrExclDraws: wrExclDraws(wins, losses),
    wrLo: ci.lo,
    wrHi: ci.hi,
    ciMethod: ci.method,
    players: activePlayers,
    isBucket: raw.isBucket,
  }
}

// ---- Matchup lookup --------------------------------------------------------

const ZERO_REC: WLD = { wins: 0, losses: 0, draws: 0 }

/** Look up a's record vs b from the unordered pair list (swap if reversed). */
function lookupMatchup(
  matchups: RawMatchup[],
  aSlug: string,
  bSlug: string
): WLD {
  for (const m of matchups) {
    if (m.a === aSlug && m.b === bSlug) {
      return { wins: m.w, losses: m.l, draws: m.d }
    }
    if (m.a === bSlug && m.b === aSlug) {
      return { wins: m.l, losses: m.w, draws: m.d }
    }
  }
  return ZERO_REC
}

// ---- Trend + card mapping --------------------------------------------------

function trendPoint(week: RawTrendWeek): TrendPointDTO {
  const games = week.w + week.l + week.d
  return {
    weekStart: asIso(week.weekStart),
    presencePct: week.fieldDecks > 0 ? week.decks / week.fieldDecks : 0,
    wr: games > 0 ? wrOf(week.w, week.l, week.d) : null,
    games,
  }
}

function cardDto(raw: RawCard, board: 'MAIN' | 'SIDE'): CardAdoptionDTO {
  return {
    cardId: raw.cardId,
    name: raw.name,
    board,
    avgCount: raw.avgCount,
    decksPlaying: raw.decksPlaying,
    presencePct: raw.presencePct,
  }
}

// ---- The data source -------------------------------------------------------

function emptyKpis(): WindowKpisDTO {
  return { tournaments: 0, entries: 0, matches: 0 }
}

export class FixtureDataSource implements MetaDataSource {
  async listFormats(): Promise<FormatDTO[]> {
    return sortFormats(
      db.formats.map(f => ({
        slug: f.slug as FormatSlug,
        name: f.name,
        displayName: f.displayName,
      }))
    )
  }

  /** Shared core: derive every row, then run the shared selection pipeline
   *  (rank / topN / min / add / tiers / buckets / sort) from derive.ts. */
  private buildReport(
    win: RawWindow,
    q: MetaQuery,
    sort: MetaSort
  ): MetaReportDTO {
    const denom = win.kpis.matches
    const intrinsics = win.archetypes.map(a => deriveIntrinsic(a, denom))
    const { rows, other } = selectReportRows(intrinsics, denom, q, sort)
    return {
      window: { start: asIso(win.start), end: asIso(win.end) },
      kpis: win.kpis,
      rows,
      other,
      generatedAt: db.generatedAt,
    }
  }

  async getLatestWindow(
    format: FormatSlug
  ): Promise<{ start: IsoDate; end: IsoDate } | null> {
    const f = findFormat(String(format))
    if (!f) return null
    const populated = f.windows.filter(w => w.kpis.matches > 0)
    if (populated.length === 0) return null
    const latest = populated.reduce((a, b) => (b.end > a.end ? b : a))
    return { start: asIso(latest.start), end: asIso(latest.end) }
  }

  async getMetaReport(q: MetaQuery): Promise<MetaReportDTO> {
    const win = findWindow(q.format, q)
    if (!win || win.archetypes.length === 0) {
      return {
        window: { start: q.start, end: q.end },
        kpis: win ? win.kpis : emptyKpis(),
        rows: [],
        other: null,
        generatedAt: db.generatedAt,
      }
    }
    return this.buildReport(win, q, DEFAULT_SORT)
  }

  /** searchParams-aware variant used by pages that also need the `?sort` key
   *  (not part of the frozen MetaQuery). Kept additive so the interface stays
   *  intact; pages may call this instead of `getMetaReport`. */
  async getMetaReportSorted(
    q: MetaQuery,
    sp: SearchParamsInput
  ): Promise<MetaReportDTO> {
    const win = findWindow(q.format, q)
    if (!win || win.archetypes.length === 0) return this.getMetaReport(q)
    return this.buildReport(win, q, parseSort(sp))
  }

  async getArchetypeDetail(
    q: MetaQuery & { slug: ArchetypeSlug }
  ): Promise<ArchetypeDetailDTO | null> {
    const win = findWindow(q.format, q)
    if (!win) return null
    const raw = win.archetypes.find(a => a.slug === String(q.slug))
    if (!raw) return null

    // Reuse the report pipeline so summary rank/tier match the table exactly.
    const report = this.buildReport(
      win,
      { ...q, hideBuckets: false },
      DEFAULT_SORT
    )
    // Below-floor archetypes are absent from report.rows; recompute the dense
    // identity rank over the full window (mirroring buildReport) so the fallback
    // preserves the true presence rank (§9 rule 3) instead of an invalid 0.
    const rankMap = presenceRankMap(
      win.archetypes.map(a => deriveIntrinsic(a, win.kpis.matches)),
      q.weight
    )
    const summary =
      report.rows.find(r => r.slug === String(q.slug)) ??
      ({
        ...deriveIntrinsic(raw, win.kpis.matches),
        presenceRank: rankMap.get(String(q.slug)) ?? 0,
        tier: null,
      } as ArchetypeRowDTO)

    // This archetype's row vs every other archetype in the window.
    const others = win.archetypes.filter(a => a.slug !== raw.slug)
    const matchups: MatchupCellDTO[] = others.map(col =>
      buildCell(
        raw.slug,
        col.slug,
        raw.name,
        col.name,
        lookupMatchup(win.matchups, raw.slug, col.slug)
      )
    )

    return {
      archetype: { slug: q.slug, name: raw.name, color: raw.color },
      window: { start: asIso(win.start), end: asIso(win.end) },
      kpis: win.kpis,
      summary,
      mainCards: raw.mainCards.map(c => cardDto(c, 'MAIN')),
      sideCards: raw.sideCards.map(c => cardDto(c, 'SIDE')),
      matchups,
      trends: raw.trend.map(trendPoint),
    }
  }

  async getArchetypeCards(
    q: MetaQuery & { slug: ArchetypeSlug; board: 'MAIN' | 'SIDE' }
  ): Promise<CardAdoptionDTO[]> {
    const win = findWindow(q.format, q)
    const raw = win?.archetypes.find(a => a.slug === String(q.slug))
    if (!raw) return []
    const cards = q.board === 'SIDE' ? raw.sideCards : raw.mainCards
    return cards.map(c => cardDto(c, q.board))
  }

  async getArchetypeTrends(
    q: MetaQuery & { slug: ArchetypeSlug }
  ): Promise<TrendPointDTO[]> {
    const win = findWindow(q.format, q)
    const raw = win?.archetypes.find(a => a.slug === String(q.slug))
    if (!raw) return []
    return raw.trend.map(trendPoint)
  }

  async getMatchupMatrix(
    q: MetaQuery & { matrixTopN: number }
  ): Promise<MatrixDTO> {
    const win = findWindow(q.format, q)
    if (!win || win.archetypes.length === 0) {
      return {
        window: { start: q.start, end: q.end },
        order: [],
        cells: [],
      }
    }
    const denom = win.kpis.matches
    const intrinsics = win.archetypes.map(a => deriveIntrinsic(a, denom))
    // Share the dense identity rank the table/scatter/tiles use so the matrix
    // never renders a divergent number on a presence-weight tie (§9 rule 3).
    const rankMap = presenceRankMap(intrinsics, q.weight)

    const ordered = intrinsics
      .filter(r => !r.isBucket)
      .sort((a, b) => weightOf(b, q.weight) - weightOf(a, q.weight))
      .slice(0, q.matrixTopN)

    const order: MatrixOrderEntryDTO[] = ordered.map(r => ({
      slug: asSlug(r.slug),
      name: r.name,
      color: r.color,
      globalWr: r.games > 0 ? r.wr : null,
      share: r.share,
      matches: r.matches,
      presenceRank: rankMap.get(r.slug) ?? 0,
    }))

    const cells: MatchupCellDTO[] = []
    for (const rowR of ordered) {
      for (const colR of ordered) {
        // Mirror cells are blanked in the UI; keep them zero-filled.
        const rec =
          rowR.slug === colR.slug
            ? ZERO_REC
            : lookupMatchup(win.matchups, rowR.slug, colR.slug)
        cells.push(buildCell(rowR.slug, colR.slug, rowR.name, colR.name, rec))
      }
    }

    return {
      window: { start: asIso(win.start), end: asIso(win.end) },
      order,
      cells,
    }
  }

  async getMatchup(
    q: MetaQuery & { a: ArchetypeSlug; b: ArchetypeSlug }
  ): Promise<MatchupCellDTO | null> {
    const win = findWindow(q.format, q)
    if (!win) return null
    const a = win.archetypes.find(x => x.slug === String(q.a))
    const b = win.archetypes.find(x => x.slug === String(q.b))
    if (!a || !b) return null
    return buildCell(
      a.slug,
      b.slug,
      a.name,
      b.name,
      lookupMatchup(win.matchups, a.slug, b.slug)
    )
  }

  async getFormatMetaChanges(format: FormatSlug): Promise<MetaChangeDTO[]> {
    const f = findFormat(String(format))
    if (!f) return []
    return [...f.metaChanges].sort((x, y) => (x.date < y.date ? -1 : 1))
  }

  async getTournaments(q: MetaQuery): Promise<TournamentDTO[]> {
    const win = findWindow(q.format, q)
    if (!win) return []
    return win.tournaments.map(t => ({
      id: t.id,
      name: t.name,
      date: asIso(t.date),
      source: t.source,
      ...(t.link ? { link: t.link } : {}),
      entries: t.entries,
    }))
  }

  async getSources(q: MetaQuery): Promise<SourceDTO[]> {
    const win = findWindow(q.format, q)
    if (!win) return []
    const acc = new Map<TournamentDTO['source'], SourceDTO>()
    for (const t of win.tournaments) {
      const cur =
        acc.get(t.source) ??
        ({ source: t.source, tournaments: 0, entries: 0 } as SourceDTO)
      cur.tournaments += 1
      cur.entries += t.entries
      acc.set(t.source, cur)
    }
    return [...acc.values()].sort((a, b) => b.entries - a.entries)
  }

  async searchArchetypes(
    format: FormatSlug,
    query: string
  ): Promise<ArchetypeRef[]> {
    const f = findFormat(String(format))
    if (!f) return []
    const q = query.trim().toLowerCase()
    const seen = new Set<string>()
    const out: ArchetypeRef[] = []
    for (const win of f.windows) {
      for (const a of win.archetypes) {
        if (seen.has(a.slug)) continue
        if (
          q === '' ||
          a.name.toLowerCase().includes(q) ||
          a.slug.includes(q)
        ) {
          seen.add(a.slug)
          out.push({ slug: asSlug(a.slug), name: a.name })
        }
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async resolveSlug(
    format: FormatSlug,
    slug: ArchetypeSlug
  ): Promise<ArchetypeRef | null> {
    const f = findFormat(String(format))
    if (!f) return null
    const target = f.aliases?.[String(slug)] ?? String(slug)
    for (const win of f.windows) {
      const a = win.archetypes.find(x => x.slug === target)
      if (a) return { slug: asSlug(a.slug), name: a.name }
    }
    return null
  }
}
