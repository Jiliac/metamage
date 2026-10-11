import type {
  ArchetypeSlug,
  EventMatchupDTO,
  StandingDTO,
  TournamentDTO,
} from '@/datasource/types'

// ---------------------------------------------------------------------------
// Fixture event synthesis. db.jsonl carries per-window tournaments (id, size,
// source) and at most 8 recent-deck entries per archetype, so
// FixtureDataSource.getTournament builds full standings here: the event's
// real entries first (their ids resolve through getDeck, so `?deck` links
// open their lists), then filler drawn by the window's deck counts with no
// stored list. A seeded Swiss run (pair by points, ~5% draws) sets every
// record. Deterministic per tournament id, so pages and snapshots are
// stable. Pure; no I/O.
// ---------------------------------------------------------------------------

export type FixtureArchetype = {
  slug: string
  name: string
  color: string | null
  isBucket: boolean
  decks: number
  players: readonly { p: string }[]
}

function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — a tiny seeded PRNG (no runtime dependency). */
function rngFrom(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function uuidFrom(rand: () => number): string {
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(rand() * 16).toString(16)
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

function pickWeighted<T extends { decks: number }>(
  items: readonly T[],
  rand: () => number
): T {
  const total = items.reduce((s, x) => s + Math.max(0, x.decks), 0)
  let r = rand() * total
  for (const x of items) {
    r -= Math.max(0, x.decks)
    if (r < 0) return x
  }
  return items[items.length - 1]
}

/** One of the event's real fixture entries (a getDeck-resolvable id). */
export type SeedEntry = {
  entryId: string
  player: string
  arch: FixtureArchetype
  hasDecklist: boolean
  decklistUrl: string | null
}

type Result = 'W' | 'L' | 'D'
type Mutable = SeedEntry & { wins: number; losses: number; draws: number }

/** Full standings and matchups for one fixture event: the seeded real
 *  entries plus filler up to the event size, after a seeded Swiss run. */
export function synthesizeEvent(
  tournament: TournamentDTO,
  archetypes: readonly FixtureArchetype[],
  seeded: readonly SeedEntry[] = []
): { standings: StandingDTO[]; matchups: EventMatchupDTO[] } {
  const n = Math.max(tournament.entries, seeded.length)
  if (n === 0 || (archetypes.length === 0 && seeded.length === 0)) {
    return { standings: [], matchups: [] }
  }
  const rand = rngFrom(seedOf(tournament.id))
  const field = [
    ...seeded,
    ...fillerEntries(archetypes, n - seeded.length, rand),
  ]
  const { entries, matchups } = runSwiss(field, rand)
  return {
    standings: toStandings(entries, tournament.source === 'MTGO'),
    matchups,
  }
}

/** `count` entries without a stored list, drawn by the window's deck counts. */
function fillerEntries(
  archetypes: readonly FixtureArchetype[],
  count: number,
  rand: () => number
): SeedEntry[] {
  const usedPlayers = new Map<string, number>()
  return Array.from({ length: count }, (): SeedEntry => {
    const arch = pickWeighted(archetypes, rand)
    const k = usedPlayers.get(arch.slug) ?? 0
    usedPlayers.set(arch.slug, k + 1)
    return {
      entryId: uuidFrom(rand),
      player: arch.players[k]?.p ?? `${arch.slug}-p${k + 1}`,
      arch,
      hasDecklist: false,
      decklistUrl: null,
    }
  })
}

const points = (e: Mutable) => 3 * e.wins + e.draws

/** A seeded Swiss run (pair by points, ~5% draws): every entry's record plus
 *  the archetype-pair cells, from both sides. */
function runSwiss(
  field: readonly SeedEntry[],
  rand: () => number
): { entries: Mutable[]; matchups: EventMatchupDTO[] } {
  let entries: Mutable[] = field.map(e => ({
    ...e,
    wins: 0,
    losses: 0,
    draws: 0,
  }))
  const cells = new Map<string, EventMatchupDTO>()
  const rounds = Math.max(3, Math.ceil(Math.log2(field.length)))
  for (let round = 0; round < rounds; round++) {
    const order = [...entries].sort((a, b) => points(b) - points(a))
    const next = new Map<string, Mutable>()
    for (let i = 0; i + 1 < order.length; i += 2) {
      const a = order[i]
      const b = order[i + 1]
      const roll = rand()
      const res: Result = roll < 0.05 ? 'D' : roll < 0.525 ? 'W' : 'L'
      const resB = res === 'W' ? 'L' : res === 'L' ? 'W' : 'D'
      next.set(a.entryId, bump(a, res))
      next.set(b.entryId, bump(b, resB))
      recordCell(cells, a.arch, b.arch, res)
      recordCell(cells, b.arch, a.arch, resB)
    }
    entries = entries.map(e => next.get(e.entryId) ?? e)
  }
  return { entries, matchups: [...cells.values()] }
}

function recordCell(
  cells: Map<string, EventMatchupDTO>,
  row: FixtureArchetype,
  col: FixtureArchetype,
  res: Result
): void {
  const key = `${row.slug}|${col.slug}`
  const cur = cells.get(key) ?? {
    rowSlug: row.slug as ArchetypeSlug,
    colSlug: col.slug as ArchetypeSlug,
    wins: 0,
    losses: 0,
    draws: 0,
  }
  cells.set(key, bump(cur, res))
}

/** Final order by points then fewer losses; MTGO events publish placings. */
function toStandings(
  entries: readonly Mutable[],
  ranked: boolean
): StandingDTO[] {
  const finalOrder = [...entries].sort(
    (a, b) => points(b) - points(a) || a.losses - b.losses
  )
  return finalOrder.map((e, i) => ({
    entryId: e.entryId,
    rank: ranked ? i + 1 : null,
    wins: e.wins,
    losses: e.losses,
    draws: e.draws,
    player: e.player,
    archetype: {
      slug: e.arch.slug as ArchetypeSlug,
      name: e.arch.name,
      color: e.arch.color,
      isBucket: e.arch.isBucket,
    },
    ...(e.decklistUrl ? { decklistUrl: e.decklistUrl } : {}),
    hasDecklist: e.hasDecklist,
  }))
}

function bump<T extends { wins: number; losses: number; draws: number }>(
  e: T,
  res: Result
): T {
  return {
    ...e,
    wins: e.wins + (res === 'W' ? 1 : 0),
    losses: e.losses + (res === 'L' ? 1 : 0),
    draws: e.draws + (res === 'D' ? 1 : 0),
  }
}
