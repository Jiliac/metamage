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
} from '@/datasource/types'
import { asIsoDate, buildHref } from '@/lib/params'
import { presenceRank, wr as wrOf } from '@/lib/stats'

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

/** '1st', '2nd', '11th', '21st'; null when the source has no placing. */
export function placingLabel(rank: number | null): string | null {
  if (rank === null) return null
  const mod100 = rank % 100
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`
  const suffix = ['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th'
  return `${rank}${suffix}`
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

export function eventStats(
  standings: readonly StandingDTO[],
  matchups: readonly EventMatchupDTO[],
  date: IsoDate,
  opts: { matrixTopN?: number } = {}
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

  // Dense identity ranks: non-buckets 1..k by decks, buckets after (same
  // scheme as the window's presenceRankMap).
  const nonBucket = rows.filter(r => !r.isBucket)
  const buckets = rows.filter(r => r.isBucket)
  const nbRanks = presenceRank(nonBucket.map(r => r.decks))
  const bRanks = presenceRank(buckets.map(r => r.decks))
  const offset = nbRanks.length ? Math.max(...nbRanks) : 0
  const field: EventFieldRow[] = [
    ...nonBucket.map((r, i) => ({ ...r, presenceRank: nbRanks[i] })),
    ...buckets.map((r, i) => ({ ...r, presenceRank: offset + bRanks[i] })),
  ]

  return { field, matrix: eventMatrix(field, matchups, date, opts) }
}

function eventMatrix(
  field: readonly EventFieldRow[],
  matchups: readonly EventMatchupDTO[],
  date: IsoDate,
  opts: { matrixTopN?: number }
): MatrixDTO {
  const cellBy = new Map<string, EventMatchupDTO>()
  const totals = new Map<string, { w: number; l: number; d: number }>()
  for (const m of matchups) {
    cellBy.set(`${m.rowSlug}|${m.colSlug}`, m)
    const t = totals.get(m.rowSlug) ?? { w: 0, l: 0, d: 0 }
    totals.set(m.rowSlug, {
      w: t.w + m.wins,
      l: t.l + m.losses,
      d: t.d + m.draws,
    })
  }
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
    }
  })

  // One event rarely puts 5 games on a pair, so the window's low-N blanking
  // would leave a grid of dashes. Show any played pair; the ink's
  // reliability fade (games/50) already marks how thin each cell is.
  const cells: MatchupCellDTO[] = []
  for (const row of ordered) {
    for (const col of ordered) {
      const m =
        row.slug === col.slug
          ? undefined
          : cellBy.get(`${row.slug}|${col.slug}`)
      const cell = buildCell(row.slug, col.slug, row.name, col.name, {
        wins: m?.wins ?? 0,
        losses: m?.losses ?? 0,
        draws: m?.draws ?? 0,
      })
      cells.push({ ...cell, lowN: cell.games === 0 })
    }
  }

  return { window: { start: date, end: date }, order, cells }
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

/** An archetype page href whose window holds the event. */
export function archetypeHref(
  format: FormatSlug | string,
  query: MetaQuery,
  slug: string,
  eventDate: IsoDate,
  now?: Date
): string {
  return buildHref(
    format,
    { ...query, ...windowHolding(query, eventDate) },
    { path: `/archetype/${slug}`, now }
  )
}

/**
 * Standings row → the archetype page's Decklists tab with this entry
 * selected (`?deck=<entryId>`, resolved by the archetype page). Null for the
 * unknown/conflict buckets, which have no archetype page.
 */
export function deckHref(
  format: FormatSlug | string,
  query: MetaQuery,
  standing: StandingDTO,
  eventDate: IsoDate,
  now?: Date
): string | null {
  if (standing.archetype.isBucket) return null
  const href = archetypeHref(
    format,
    query,
    standing.archetype.slug,
    eventDate,
    now
  )
  const deck = `deck=${encodeURIComponent(standing.entryId)}`
  return href.includes('?') ? `${href}&${deck}` : `${href}?${deck}`
}
