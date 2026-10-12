import { buildCell } from '@/datasource/derive'
import type {
  ArchetypeSlug,
  EventMatchupDTO,
  FormatSlug,
  IsoDate,
  MatchupCellDTO,
  MatrixDTO,
  MatrixOrderEntryDTO,
  MetaQuery,
  StandingDTO,
  TournamentDTO,
} from '@/datasource/types'
import { asIsoDate, buildHref } from '@/lib/params'
import { wr as wrOf } from '@/lib/stats'

// ---------------------------------------------------------------------------
// Event (single-tournament) view logic: standings order, labels, the event's
// field + matchup matrix, and the standings → decklist link. Pure; both data
// backends hand the page the same TournamentDetailDTO and everything shown is
// derived here.
// ---------------------------------------------------------------------------

/** Tournament ids: DB UUIDs or fixture ids ('2026-05-01-mtgo-17'). Checked
 *  before any data call so garbage never reaches the DB or grows the cache. */
const EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/

export function isEventId(raw: string): boolean {
  return EVENT_ID_RE.test(raw)
}

/** Display name of each event source. */
export const SOURCE_LABEL: Record<TournamentDTO['source'], string> = {
  MTGO: 'Magic Online',
  MELEE: 'Melee.gg',
  CARDSREALM: 'Cardsrealm',
  OTHER: 'Other',
}

const points = (s: StandingDTO) => 3 * s.wins + s.draws

/**
 * Standings order: published placings first (rank asc), then entries without
 * one by match points, fewer losses, then player name. Returns a new array.
 */
export function sortStandings(
  standings: readonly StandingDTO[]
): StandingDTO[] {
  return [...standings].sort((a, b) => {
    if (a.rank !== null && b.rank !== null) {
      return a.rank - b.rank || a.player.localeCompare(b.player)
    }
    if (a.rank !== null) return -1
    if (b.rank !== null) return 1
    return (
      points(b) - points(a) ||
      a.losses - b.losses ||
      a.player.localeCompare(b.player)
    )
  })
}

/** A standing with the placing the table shows: the published one, or a
 *  competition rank derived from the record when the source has none. */
export type RankedStanding = {
  standing: StandingDTO
  /** 1-based placing. Tied derived records share a place ("1224" ranking). */
  place: number
  /** True when `place` was derived from match points rather than published. */
  derived: boolean
}

/** Standings table page size: a 50-row page keeps one event's long tail
 *  (1,500-player Regional Championships) off the first paint. */
export const STANDINGS_PAGE_SIZE = 50

/**
 * Sorted standings with an explicit place on every row. Published placings
 * are kept verbatim; entries without one are ranked after them by match
 * points (3 per win, 1 per draw), then fewer losses — the same order
 * `sortStandings` uses — and equal full records (points, losses AND draws)
 * share a place, so the number never implies a tiebreak the data cannot
 * support. Derived places also never undercut a published rank: they start
 * above the highest one seen, so a sparse tail ([1, 2, 10]) is not handed a
 * derived place beneath a rank the row numerically beats. Returns a new
 * array.
 */
export function rankStandings(
  standings: readonly StandingDTO[]
): RankedStanding[] {
  const sorted = sortStandings(standings)
  const out: RankedStanding[] = []
  let prev: RankedStanding | null = null
  let lastPublished = 0
  sorted.forEach((s, i) => {
    if (s.rank !== null) {
      lastPublished = Math.max(lastPublished, s.rank)
      prev = { standing: s, place: s.rank, derived: false }
      out.push(prev)
      return
    }
    const tied =
      prev !== null &&
      prev.derived &&
      points(prev.standing) === points(s) &&
      prev.standing.losses === s.losses &&
      prev.standing.draws === s.draws
    prev = {
      standing: s,
      place: tied
        ? prev!.place
        : Math.max(i + 1, lastPublished + 1, prev ? prev.place + 1 : 1),
      derived: true,
    }
    out.push(prev)
  })
  return out
}

/** MTGO publishes only the top decks, so its records count only matches
 *  against other published decks; every other source's records are whole. */
export function isPartialRecordSource(
  source: TournamentDTO['source']
): boolean {
  return source === 'MTGO'
}

/** '1st', '2nd', '11th', '21st'; null when the source has no placing. */
export function placingLabel(rank: number | null): string | null {
  if (rank === null) return null
  const mod100 = rank % 100
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`
  const suffix = ['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th'
  return `${rank}${suffix}`
}

/** The headline deck's label from its placing: an outright winner, the best
 *  published placing when 1st is missing, or the best record when unranked. */
export function leaderLabel(rank: number | null): string {
  if (rank === 1) return 'Winner'
  return rank === null ? 'Best record' : 'Top finisher'
}

/** 'W-L', with '-D' only when the entry drew. */
export function recordLabel(s: Pick<StandingDTO, 'wins' | 'losses' | 'draws'>) {
  return s.draws > 0
    ? `${s.wins}-${s.losses}-${s.draws}`
    : `${s.wins}-${s.losses}`
}

// ---- Event field + matrix -------------------------------------------------

/** One archetype's share of the event, by decks (the event-sized presence). */
export type EventFieldRow = {
  slug: ArchetypeSlug
  name: string
  color: string | null
  isBucket: boolean
  decks: number
  share: number // decks / all entries
  presenceRank: number
}

export type EventStats = { field: EventFieldRow[]; matrix: MatrixDTO }

/** Default matrix size: a 32-player event rarely has more than ~10 decks
 *  with enough games to read. */
export const EVENT_MATRIX_TOP_N = 10

/** The event field (decks per archetype, presence-ranked) and its matchup
 *  matrix (top non-bucket archetypes that played at least one game). */
export function eventStats(
  standings: readonly StandingDTO[],
  matchups: readonly EventMatchupDTO[],
  date: IsoDate,
  opts: EventMatrixOpts = {}
): EventStats {
  const total = standings.length
  const byArch = new Map<string, Omit<EventFieldRow, 'presenceRank'>>()
  for (const s of standings) {
    const a = s.archetype
    const cur = byArch.get(a.slug)
    byArch.set(a.slug, {
      slug: a.slug,
      name: a.name,
      color: a.color,
      isBucket: a.isBucket,
      decks: (cur?.decks ?? 0) + 1,
      share: 0,
    })
  }
  const rows = [...byArch.values()]
    .map(r => ({ ...r, share: total > 0 ? r.decks / total : 0 }))
    .sort(
      (a, b) =>
        Number(a.isBucket) - Number(b.isBucket) ||
        b.decks - a.decks ||
        a.name.localeCompare(b.name)
    )

  // Identity ranks: one number per archetype, in field order (decks desc,
  // name asc), non-buckets first. An event's field is full of ties (five
  // decks with 2 entries each), and the matrix column heads carry only this
  // number, so it must identify a single archetype rather than a tie group.
  const field: EventFieldRow[] = rows.map((r, i) => ({
    ...r,
    presenceRank: i + 1,
  }))

  return { field, matrix: eventMatrix(field, matchups, date, opts) }
}

export type EventMatrixOpts = {
  matrixTopN?: number
  /** Signature-card art for an archetype name (the page passes the static art
   *  map lookup); absent → the matrix heads fall back to the mana gradient. */
  artFor?: (name: string) => MatrixOrderEntryDTO['art']
}

type Totals = { w: number; l: number; d: number }

/** Each row archetype's summed record across the event's matchup rows. */
function rowTotals(matchups: readonly EventMatchupDTO[]): Map<string, Totals> {
  const totals = new Map<string, Totals>()
  for (const m of matchups) {
    const t = totals.get(m.rowSlug) ?? { w: 0, l: 0, d: 0 }
    totals.set(m.rowSlug, {
      w: t.w + m.wins,
      l: t.l + m.losses,
      d: t.d + m.draws,
    })
  }
  return totals
}

function eventMatrix(
  field: readonly EventFieldRow[],
  matchups: readonly EventMatchupDTO[],
  date: IsoDate,
  opts: EventMatrixOpts
): MatrixDTO {
  const totals = rowTotals(matchups)
  const games = (slug: string) => {
    const t = totals.get(slug)
    return t ? t.w + t.l + t.d : 0
  }

  const ordered = field
    .filter(r => !r.isBucket && games(r.slug) > 0)
    .slice(0, opts.matrixTopN ?? EVENT_MATRIX_TOP_N)

  const order: MatrixOrderEntryDTO[] = ordered.map(r => {
    const t = totals.get(r.slug)!
    return {
      slug: r.slug,
      name: r.name,
      color: r.color,
      globalWr: wrOf(t.w, t.l, t.d),
      share: r.share,
      matches: t.w + t.l + t.d,
      presenceRank: r.presenceRank,
      art: opts.artFor?.(r.name) ?? null,
    }
  })

  return {
    window: { start: date, end: date },
    order,
    cells: eventCells(ordered, matchups),
  }
}

/** Every ordered row × column cell. One event rarely puts 5 games on a pair,
 *  so the window's low-N blanking would leave a grid of dashes. Show any
 *  played pair; the ink's reliability fade (games/50) already marks how thin
 *  each cell is. */
function eventCells(
  ordered: readonly EventFieldRow[],
  matchups: readonly EventMatchupDTO[]
): MatchupCellDTO[] {
  const cellBy = new Map(matchups.map(m => [`${m.rowSlug}|${m.colSlug}`, m]))
  return ordered.flatMap(row =>
    ordered.map(col => {
      const m =
        row.slug === col.slug
          ? undefined
          : cellBy.get(`${row.slug}|${col.slug}`)
      const cell = buildCell(row.slug, col.slug, row.name, col.name, {
        wins: m?.wins ?? 0,
        losses: m?.losses ?? 0,
        draws: m?.draws ?? 0,
      })
      return { ...cell, lowN: cell.games === 0 }
    })
  )
}

// ---- Links ----------------------------------------------------------------

const DAY_MS = 86_400_000

/** The lens window when it holds `date`, else the 30 days ending on it — so
 *  the archetype page always has the event's matches in view. */
function windowHolding(
  query: MetaQuery,
  date: IsoDate
): { start: IsoDate; end: IsoDate } {
  if (query.start <= date && date <= query.end) {
    return { start: query.start, end: query.end }
  }
  const end = Date.parse(`${date}T00:00:00Z`)
  return {
    start: asIsoDate(new Date(end - 29 * DAY_MS).toISOString().slice(0, 10)),
    end: date,
  }
}

/** An archetype page href whose window holds the event; `deck` selects one
 *  entry on its Decklists tab. */
export function archetypeHref(
  format: FormatSlug | string,
  query: MetaQuery,
  slug: string,
  eventDate: IsoDate,
  now?: Date,
  deck?: string
): string {
  return buildHref(
    format,
    { ...query, ...windowHolding(query, eventDate) },
    { path: `/archetype/${slug}`, deck, now }
  )
}

/**
 * Standings row → the archetype page's Decklists tab with this entry
 * selected (`?deck=<entryId>`, resolved by the archetype page). Null for the
 * unknown/conflict buckets, which have no archetype page, and for entries
 * without stored cards, which have no list to show there.
 */
export function deckHref(
  format: FormatSlug | string,
  query: MetaQuery,
  standing: StandingDTO,
  eventDate: IsoDate,
  now?: Date
): string | null {
  if (standing.archetype.isBucket || !standing.hasDecklist) return null
  return archetypeHref(
    format,
    query,
    standing.archetype.slug,
    eventDate,
    now,
    standing.entryId
  )
}

/** Where a standings row's click goes: its stored list, else the source's. */
export type StandingLink = { href: string; external: boolean }

export function standingLink(
  format: FormatSlug | string,
  query: MetaQuery,
  standing: StandingDTO,
  eventDate: IsoDate,
  now?: Date
): StandingLink | null {
  const internal = deckHref(format, query, standing, eventDate, now)
  if (internal) return { href: internal, external: false }
  return standing.decklistUrl
    ? { href: standing.decklistUrl, external: true }
    : null
}
