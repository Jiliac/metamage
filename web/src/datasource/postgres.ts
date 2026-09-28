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
  MetaSort,
  SourceDTO,
  TournamentDTO,
  TrendPointDTO,
  WindowKpisDTO,
} from '@/datasource/types'
import {
  DEFAULT_SORT,
  buildCell,
  presenceRankMap,
  selectReportRows,
  weightOf,
  type IntrinsicRow,
} from '@/datasource/derive'
import { db } from '@/datasource/postgres/client'
import { sortFormats } from '@/datasource/format-order'
import {
  loadArchetypes,
  loadFormatId,
  loadKpi,
  loadMatchups,
  loadPlayerRecords,
} from '@/datasource/postgres/loaders'
import {
  ZERO_REC,
  matchupIndex,
  orientedPair,
} from '@/datasource/postgres/matchups'
import {
  archetypeDisplayName,
  artFor,
  formatDisplayName,
  formatDto,
  isBucketName,
  slugifyArchetype,
} from '@/datasource/postgres/naming'
import {
  ARCHETYPE_BY_ALIAS_SQL,
  CARD_ADOPTION_SQL,
  DECK_COUNT_SQL,
  FORMATS_SQL,
  LATEST_WINDOW_SQL,
  META_CHANGES_SQL,
  SEARCH_ARCHETYPES_SQL,
  SOURCES_SQL,
  TOURNAMENTS_SQL,
  TREND_SQL,
  type ArchetypeRow,
  type MatchupRow,
  type PlayerRow,
} from '@/datasource/postgres/sql'
import { winrateCi, wr as wrOf, wrExclDraws, type WLD } from '@/lib/stats'
import type { SearchParamsInput } from '@/lib/params'
import { parseSort } from '@/lib/params'

export { archetypeDisplayName, formatDisplayName }

// ---------------------------------------------------------------------------
// PostgresDataSource — the live-data read path behind the frozen
// `MetaDataSource` contract (blueprint §3; README "Swapping in Postgres").
// Serves the `tournament` database populated by
// scripts/migrate_tournament_to_postgres.py. Query vocabulary and aggregation
// semantics mirror the MCP surface (src/analysis/*) and the R pipeline
// (visualize/db.R); the SQL itself lives in ./postgres/sql.ts, the lazy client
// in ./postgres/client.ts, slug/casing/art helpers in ./postgres/naming.ts,
// the per-request memoized window loaders in ./postgres/loaders.ts, and the
// oriented matchup lookup in ./postgres/matchups.ts.
//
// Anti-drift: this file fetches RAW counts only. Per-archetype W/L/D and CI
// come from @/lib/stats (`deriveIntrinsic` below); presence ranks, the
// topN / minMatches / includeArchetypes / hideBuckets / tier selection,
// sorting, and matchup-cell math are the SAME functions the fixtures backend
// runs (@/datasource/derive), so the fixtures snapshot test is the parity
// oracle for both backends.
// ---------------------------------------------------------------------------

// ---- Small helpers ---------------------------------------------------------

const asSlug = (s: string) => s as ArchetypeSlug
const asIso = (d: unknown) => {
  // postgres.js returns JS Date for date/timestamp columns; the DTO wants
  // 'YYYY-MM-DD' in UTC so it round-trips through the canonical URL.
  if (d instanceof Date) {
    return d.toISOString().slice(0, 10) as IsoDate
  }
  return String(d).slice(0, 10) as IsoDate
}

/** Archetype identity as the class passes it around (display-cased name). */
type ArchetypeMeta = { id: string; name: string; color: string | null }

/** The window aggregates every table/matrix/detail view starts from. */
type WindowData = {
  kpi: WindowKpisDTO
  /** Archetypes with at least one match row in the window — the population
   *  the fixtures oracle iterates as `win.archetypes`. Historical archetypes
   *  with no window activity are excluded so they never surface as 0-match
   *  table rows or 0-0 matchup cells. */
  active: ArchetypeMeta[]
  intrinsics: IntrinsicRow[]
}

// ---- Row derivation (the one place stats.ts is applied to archetypes) ------

function deriveIntrinsic(
  slug: string,
  name: string,
  color: string | null,
  isBucket: boolean,
  denomMatches: number,
  players: PlayerRow[],
  formatName: string
): IntrinsicRow {
  let wins = 0
  let losses = 0
  let draws = 0
  const clusters: WLD[] = []
  for (const p of players) {
    wins += p.wins
    losses += p.losses
    draws += p.draws
    clusters.push({ wins: p.wins, losses: p.losses, draws: p.draws })
  }
  const games = wins + losses + draws
  const ci = winrateCi(clusters)
  const activePlayers = players.filter(
    p => p.wins + p.losses + p.draws > 0
  ).length
  return {
    slug: asSlug(slug),
    name,
    color,
    art: isBucket ? null : artFor(formatName, name),
    // The archetype's DISTINCT entry total in the window (match-having only).
    // The window entry_count on each player row is that player's entries in
    // THIS archetype; players are disjoint by player_id, so the sum
    // reconstructs the archetype total (COUNT(DISTINCT entry_id) semantics).
    decks: players.reduce((s, p) => s + p.entry_count, 0),
    share: denomMatches > 0 ? games / denomMatches : 0,
    wins,
    losses,
    draws,
    matches: games,
    games,
    points: wins + 0.5 * draws,
    wr: wrOf(wins, losses, draws),
    wrExclDraws: wrExclDraws(wins, losses),
    wrLo: ci.lo,
    wrHi: ci.hi,
    ciMethod: ci.method,
    players: activePlayers,
    isBucket,
  }
}

/** Derive every active archetype's intrinsic row from its player records. */
function deriveAll(
  active: ArchetypeMeta[],
  playersByArch: Map<string, PlayerRow[]>,
  denomMatches: number,
  formatName: string
): IntrinsicRow[] {
  return active.map(m =>
    deriveIntrinsic(
      slugifyArchetype(m.name),
      archetypeDisplayName(m.name),
      m.color,
      isBucketName(m.name),
      denomMatches,
      playersByArch.get(m.id) ?? [],
      formatName
    )
  )
}

// ---- The data source -------------------------------------------------------

export class PostgresDataSource implements MetaDataSource {
  constructor() {
    // Resolve the client eagerly so a missing TOURNAMENT_DATABASE_URL fails
    // at getDataSource() time (loud config error), not on the first query.
    db()
  }

  async listFormats(): Promise<FormatDTO[]> {
    const rows = await FORMATS_SQL()
    return sortFormats(rows.map(r => formatDto(r.name)))
  }

  /** The latest populated calendar month (see LATEST_WINDOW_SQL), or null
   *  when the format has no match-having tournament. */
  async getLatestWindow(
    format: FormatSlug
  ): Promise<{ start: IsoDate; end: IsoDate } | null> {
    const rows = await LATEST_WINDOW_SQL(String(format))
    const row = rows[0]
    if (!row?.month_start || !row?.month_end) return null
    return { start: asIso(row.month_start), end: asIso(row.month_end) }
  }

  async getMetaReport(q: MetaQuery): Promise<MetaReportDTO> {
    return this.buildReport(q, DEFAULT_SORT)
  }

  /** searchParams-aware variant mirroring FixtureDataSource (the `?sort`
   *  knob lives outside the frozen MetaQuery; pages may call this instead). */
  async getMetaReportSorted(
    q: MetaQuery,
    sp: SearchParamsInput
  ): Promise<MetaReportDTO> {
    return this.buildReport(q, parseSort(sp))
  }

  private async buildReport(
    q: MetaQuery,
    sort: MetaSort
  ): Promise<MetaReportDTO> {
    const formatId = await this.formatIdFor(String(q.format))
    if (!formatId) {
      return {
        window: { start: q.start, end: q.end },
        kpis: { tournaments: 0, entries: 0, matches: 0 },
        rows: [],
        other: null,
        generatedAt: new Date().toISOString(),
      }
    }
    const { kpi, intrinsics } = await this.windowData(formatId, q)
    const { rows, other } = selectReportRows(intrinsics, kpi.matches, q, sort)
    return {
      window: { start: q.start, end: q.end },
      kpis: kpi,
      rows,
      other,
      generatedAt: new Date().toISOString(),
    }
  }

  async getArchetypeDetail(
    q: MetaQuery & { slug: ArchetypeSlug }
  ): Promise<ArchetypeDetailDTO | null> {
    const formatId = await this.formatIdFor(String(q.format))
    if (!formatId) return null
    const target = await this.resolveArchetypeRow(formatId, String(q.slug))
    if (!target) return null

    const { kpi, intrinsics, active } = await this.windowData(formatId, q)
    // Null when the archetype has no match in the window — the fixtures oracle
    // returns null for an archetype absent from `win.archetypes` too, and the
    // page maps that to 404.
    const summary = summaryRowFor(intrinsics, kpi.matches, q, target.name)
    if (!summary) return null

    const [matchups, cards, trends] = await Promise.all([
      this.matchupsFor(formatId, q),
      this.cardAdoption(formatId, q, target.id),
      this.trendFor(formatId, q, target.id),
    ])

    const cellByPair = matchupIndex(matchups)
    // One cell per OTHER archetype active in the window (fixtures: `others =
    // win.archetypes.filter(a => a.slug !== raw.slug)`), not per archetype in
    // the format's whole history. Every match row has its opponent-side copy,
    // so any opponent with a cell against `target` also has player rows and
    // is therefore in `active`.
    const others = active.filter(m => m.id !== target.id)
    const detailCells: MatchupCellDTO[] = others.map(col =>
      buildCell(
        String(q.slug),
        slugifyArchetype(col.name),
        target.name,
        col.name,
        orientedPair(cellByPair, target.id, col.id)
      )
    )

    return {
      archetype: {
        slug: q.slug,
        name: archetypeDisplayName(target.name),
        color: target.color,
      },
      window: { start: q.start, end: q.end },
      kpis: kpi,
      summary,
      mainCards: cards.main,
      sideCards: cards.side,
      matchups: detailCells,
      trends,
    }
  }

  async getArchetypeCards(
    q: MetaQuery & { slug: ArchetypeSlug; board: 'MAIN' | 'SIDE' }
  ): Promise<CardAdoptionDTO[]> {
    const formatId = await this.formatIdFor(String(q.format))
    if (!formatId) return []
    const target = await this.resolveArchetypeRow(formatId, String(q.slug))
    if (!target) return []
    const cards = await this.cardAdoption(formatId, q, target.id)
    return q.board === 'SIDE' ? cards.side : cards.main
  }

  async getArchetypeTrends(
    q: MetaQuery & { slug: ArchetypeSlug }
  ): Promise<TrendPointDTO[]> {
    const formatId = await this.formatIdFor(String(q.format))
    if (!formatId) return []
    const target = await this.resolveArchetypeRow(formatId, String(q.slug))
    if (!target) return []
    return this.trendFor(formatId, q, target.id)
  }

  async getMatchupMatrix(
    q: MetaQuery & { matrixTopN: number }
  ): Promise<MatrixDTO> {
    const formatId = await this.formatIdFor(String(q.format))
    if (!formatId) {
      return { window: { start: q.start, end: q.end }, order: [], cells: [] }
    }

    const [{ intrinsics, active }, matchups] = await Promise.all([
      this.windowData(formatId, q),
      this.matchupsFor(formatId, q),
    ])
    // Share the dense identity rank the table/scatter/tiles use so the matrix
    // never renders a divergent number on a presence-weight tie (§9 rule 3).
    const rankMap = presenceRankMap(intrinsics, q.weight)

    const ordered = intrinsics
      .filter(r => !r.isBucket)
      .sort((a, b) => weightOf(b, q.weight) - weightOf(a, q.weight))
      .slice(0, q.matrixTopN)

    const order: MatrixOrderEntryDTO[] = ordered.map(r => ({
      slug: r.slug,
      name: archetypeDisplayName(r.name),
      color: r.color,
      globalWr: r.games > 0 ? r.wr : null,
      share: r.share,
      matches: r.matches,
      presenceRank: rankMap.get(r.slug) ?? 0,
    }))

    const cellByPair = matchupIndex(matchups)
    const idBySlug = new Map(active.map(m => [slugifyArchetype(m.name), m.id]))
    const cells: MatchupCellDTO[] = []
    for (const rowR of ordered) {
      for (const colR of ordered) {
        const rowId = idBySlug.get(rowR.slug)!
        const colId = idBySlug.get(colR.slug)!
        // Mirror cells are blanked in the UI; keep them zero-filled.
        const rec =
          rowId === colId ? ZERO_REC : orientedPair(cellByPair, rowId, colId)
        cells.push(buildCell(rowR.slug, colR.slug, rowR.name, colR.name, rec))
      }
    }

    return { window: { start: q.start, end: q.end }, order, cells }
  }

  async getMatchup(
    q: MetaQuery & { a: ArchetypeSlug; b: ArchetypeSlug }
  ): Promise<MatchupCellDTO | null> {
    const formatId = await this.formatIdFor(String(q.format))
    if (!formatId) return null
    const a = await this.resolveArchetypeRow(formatId, String(q.a))
    const b = await this.resolveArchetypeRow(formatId, String(q.b))
    if (!a || !b) return null
    const matchups = await this.matchupsFor(formatId, q)
    const cellByPair = matchupIndex(matchups)
    return buildCell(
      String(q.a),
      String(q.b),
      a.name,
      b.name,
      orientedPair(cellByPair, a.id, b.id)
    )
  }

  async getFormatMetaChanges(format: FormatSlug): Promise<MetaChangeDTO[]> {
    const formatId = await this.formatIdFor(String(format))
    if (!formatId) return []
    const rows = await META_CHANGES_SQL(formatId)
    return rows.map(r => ({
      date: asIso(r.date),
      type: r.change_type as MetaChangeDTO['type'],
      description: r.description ?? '',
      ...(r.set_code ? { setCode: r.set_code } : {}),
    }))
  }

  async getTournaments(q: MetaQuery): Promise<TournamentDTO[]> {
    const formatId = await this.formatIdFor(String(q.format))
    if (!formatId) return []
    const rows = await TOURNAMENTS_SQL(formatId, q.start, q.end)
    return rows.map(t => ({
      id: t.id,
      name: t.name,
      date: asIso(t.date),
      source: t.source as TournamentDTO['source'],
      ...(t.link ? { link: t.link } : {}),
      entries: t.entries,
    }))
  }

  async getSources(q: MetaQuery): Promise<SourceDTO[]> {
    const formatId = await this.formatIdFor(String(q.format))
    if (!formatId) return []
    const rows = await SOURCES_SQL(formatId, q.start, q.end)
    return rows.map(r => ({
      source: r.source as SourceDTO['source'],
      tournaments: r.tournaments,
      entries: r.entries,
    }))
  }

  async searchArchetypes(
    format: FormatSlug,
    query: string
  ): Promise<ArchetypeRef[]> {
    const formatId = await this.formatIdFor(String(format))
    if (!formatId) return []
    const rows = await SEARCH_ARCHETYPES_SQL(
      formatId,
      query.trim().toLowerCase()
    )
    return rows.map(r => ({
      slug: asSlug(slugifyArchetype(r.name)),
      name: archetypeDisplayName(r.name),
    }))
  }

  async resolveSlug(
    format: FormatSlug,
    slug: ArchetypeSlug
  ): Promise<ArchetypeRef | null> {
    const formatId = await this.formatIdFor(String(format))
    if (!formatId) return null
    const row = await this.resolveArchetypeRow(formatId, String(slug))
    return row
      ? {
          slug: asSlug(slugifyArchetype(row.name)),
          name: archetypeDisplayName(row.name),
        }
      : null
  }

  // -------------------------------------------------------------------------
  // Fetch helpers (each maps one query to its DTO-ready shape). The window
  // aggregates go through ./postgres/loaders.ts so one request that renders
  // both the report and the matrix executes each of them once.
  // -------------------------------------------------------------------------

  private async formatIdFor(formatName: string): Promise<string | null> {
    const rows = await loadFormatId(formatName)
    return rows[0]?.id ?? null
  }

  private async archetypeMeta(formatId: string): Promise<ArchetypeMeta[]> {
    const rows = await loadArchetypes(formatId)
    return rows.map(toMeta)
  }

  private async kpis(formatId: string, q: MetaQuery): Promise<WindowKpisDTO> {
    const rows = await loadKpi(formatId, q.start, q.end)
    return {
      tournaments: rows[0]?.tournaments ?? 0,
      entries: rows[0]?.entries ?? 0,
      matches: rows[0]?.matches ?? 0,
    }
  }

  /** KPIs + the window's active archetypes + their intrinsic rows. */
  private async windowData(
    formatId: string,
    q: MetaQuery
  ): Promise<WindowData> {
    const [kpi, playerRows, meta] = await Promise.all([
      this.kpis(formatId, q),
      loadPlayerRecords(formatId, q.start, q.end),
      this.archetypeMeta(formatId),
    ])
    const playersByArch = groupBy(playerRows, r => r.archetype_id)
    // PLAYER_RECORDS_SQL joins matches, so a player row exists exactly for
    // archetypes with ≥1 match in the window — the fixtures' `win.archetypes`.
    const active = meta.filter(m => playersByArch.has(m.id))
    const intrinsics = deriveAll(
      active,
      playersByArch,
      kpi.matches,
      String(q.format)
    )
    return { kpi, active, intrinsics }
  }

  private async matchupsFor(
    formatId: string,
    q: MetaQuery
  ): Promise<MatchupRow[]> {
    return loadMatchups(formatId, q.start, q.end)
  }

  private async cardAdoption(
    formatId: string,
    q: MetaQuery,
    archetypeId: string
  ): Promise<{ main: CardAdoptionDTO[]; side: CardAdoptionDTO[] }> {
    const [mainRows, sideRows, deckCount] = await Promise.all([
      CARD_ADOPTION_SQL(formatId, q.start, q.end, archetypeId, 'MAIN'),
      CARD_ADOPTION_SQL(formatId, q.start, q.end, archetypeId, 'SIDE'),
      DECK_COUNT_SQL(formatId, q.start, q.end, archetypeId),
    ])
    const total = deckCount[0]?.decks ?? 0
    const map = (
      rows: typeof mainRows,
      board: 'MAIN' | 'SIDE'
    ): CardAdoptionDTO[] =>
      rows.map(r => ({
        cardId: r.card_id,
        // Raw DB casing (lowercase): the contract title-cases card names at
        // render (types.ts CardAdoptionDTO), and fixtures return them raw too.
        name: r.name,
        board,
        avgCount: r.avg_count,
        decksPlaying: r.decks_playing,
        presencePct: total > 0 ? r.decks_playing / total : 0,
      }))
    return { main: map(mainRows, 'MAIN'), side: map(sideRows, 'SIDE') }
  }

  private async trendFor(
    formatId: string,
    q: MetaQuery,
    archetypeId: string
  ): Promise<TrendPointDTO[]> {
    const rows = await TREND_SQL(formatId, q.start, q.end, archetypeId)
    return rows.map(r => {
      const games = r.wins + r.losses + r.draws
      return {
        weekStart: asIso(r.week_start),
        presencePct: r.field_decks > 0 ? r.decks / r.field_decks : 0,
        // Zero-game weeks (TREND_SQL emits them) are the chart's gaps.
        wr: games > 0 ? wrOf(r.wins, r.losses, r.draws) : null,
        games,
      }
    })
  }

  /** Resolve a URL slug to the archetype row: exact slug match on the
   *  slugified name, then aliases (the MCP `add_archetype_alias` path). No
   *  fuzzy fallback — the fixtures oracle resolves exact + alias only and the
   *  detail page promises unknown slugs a 404, not a redirect to the shortest
   *  name that happens to contain the fragment. */
  private async resolveArchetypeRow(
    formatId: string,
    slug: string
  ): Promise<ArchetypeMeta | null> {
    const rows = await loadArchetypes(formatId)
    const exact = rows.find(r => slugifyArchetype(r.name) === slug)
    if (exact) return toMeta(exact)
    const viaAlias = (await ARCHETYPE_BY_ALIAS_SQL(formatId, slug))[0]
    return viaAlias ? toMeta(viaAlias) : null
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers (pure; Postgres-specific shapes)
// ---------------------------------------------------------------------------

function toMeta(r: ArchetypeRow): ArchetypeMeta {
  return {
    id: r.id,
    name: archetypeDisplayName(r.name),
    color: r.color ?? null,
  }
}

/**
 * The detail header's summary row. Re-runs the report selection (buckets
 * shown, default sort) so a top-N archetype carries the SAME presence rank
 * and tier as its table row; an archetype below the match floor / outside
 * topN is absent from the selection and falls back to its intrinsic row with
 * the full-window dense rank and a null tier — mirroring the fixtures backend.
 * Returns null only if the archetype has no row in the window at all.
 */
function summaryRowFor(
  intrinsics: IntrinsicRow[],
  denomMatches: number,
  q: MetaQuery,
  targetName: string
): ArchetypeRowDTO | null {
  const targetSlug = slugifyArchetype(targetName)
  const { rows } = selectReportRows(
    intrinsics,
    denomMatches,
    { ...q, hideBuckets: false },
    DEFAULT_SORT
  )
  const selected = rows.find(r => r.slug === targetSlug)
  if (selected) return selected
  const intrinsic = intrinsics.find(r => r.slug === targetSlug)
  if (!intrinsic) return null
  const rankMap = presenceRankMap(intrinsics, q.weight)
  return {
    ...intrinsic,
    presenceRank: rankMap.get(targetSlug) ?? 0,
    tier: null,
  }
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const it of items) {
    const k = key(it)
    const arr = m.get(k)
    if (arr) arr.push(it)
    else m.set(k, [it])
  }
  return m
}
