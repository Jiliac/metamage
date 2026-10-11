import seedrandom from 'seedrandom'
import type {
  RawArchetype,
  RawCard,
  RawDeckCard,
  RawDeckList,
  RawEntry,
  RawTournament,
} from '../../src/datasource/fixtures'
import { basicLands, colorLetters } from './cards'
import type { Rng } from './helpers'

// ---------------------------------------------------------------------------
// Decklists-tab entries + decklists (KTD12)
// ---------------------------------------------------------------------------

/** UUID-shaped id (8-4-4-4-12 lowercase hex, v4 version/variant nibbles) drawn
 *  from a seeded rng: stable across regenerations, and accepted by `parseDeckId`
 *  so `?deck` passes KTD6 validation in fixtures mode. */
function uuidFromRng(rng: Rng): string {
  const hex = (n: number): string => {
    let s = ''
    for (let i = 0; i < n; i++) s += Math.floor(rng() * 16).toString(16)
    return s
  }
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`
}

const DECKLIST_VARIANTS = 3
const CONSTRUCTED_MAIN = 60
const CONSTRUCTED_SIDE = 15
const CONSTRUCTED_LANDS = 24
const DUEL_MAIN = 99
const DUEL_LANDS = 34

/** Static membership test for land names in an archetype's adoption pool. */
const LAND_NAMES: Record<string, true> = {
  plains: true,
  island: true,
  swamp: true,
  mountain: true,
  forest: true,
  wastes: true,
  'command tower': true,
}

/** Split `total` copies across the weights, every card getting at least one,
 *  by the largest-remainder method — sums exactly to `total`. */
function weightedSplit(total: number, weights: number[]): number[] {
  const counts = weights.map(() => 1)
  const rem = total - weights.length
  const wSum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map(w => (rem * w) / wSum)
  const floored = raw.map(Math.floor)
  let extra = rem - floored.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f)
  for (let k = 0; extra > 0; k++, extra--) {
    counts[order[k % order.length].i] += 1
  }
  return counts.map((c, i) => c + floored[i])
}

/** One variant's main deck: the spell slot split across the non-land adoption
 *  rows, the land slot across the archetype's canonical basics. */
function buildMainBoard(
  rng: Rng,
  arch: RawArchetype,
  spells: RawCard[],
  landNames: string[],
  duel: boolean
): RawDeckCard[] {
  const landTotal = duel ? DUEL_LANDS : CONSTRUCTED_LANDS
  const mainTotal = duel ? DUEL_MAIN : CONSTRUCTED_MAIN
  const spellWeights = spells.map(
    c => Math.max(0.5, c.avgCount) * (0.75 + rng() * 0.5)
  )
  const spellCounts = weightedSplit(mainTotal - landTotal, spellWeights)
  const landWeights = landNames.map(n => {
    const row = arch.mainCards.find(c => c.name === n)
    return Math.max(0.5, row ? row.avgCount : 1) * (0.75 + rng() * 0.5)
  })
  const landCounts = weightedSplit(landTotal, landWeights)
  return [
    ...spells.map<RawDeckCard>((c, i) => ({
      n: c.name,
      c: spellCounts[i],
      b: 'MAIN',
    })),
    ...landNames.map<RawDeckCard>((n, i) => ({
      n,
      c: landCounts[i],
      b: 'MAIN',
    })),
  ]
}

/** One variant's sideboard: 15 cards for constructed, or the single
 *  Commander for Duel Commander. */
function buildSideBoard(
  rng: Rng,
  arch: RawArchetype,
  duel: boolean
): RawDeckCard[] {
  if (duel) {
    return arch.sideCards.slice(0, 1).map(c => ({
      n: c.name,
      c: 1,
      b: 'SIDE',
    }))
  }
  const sideWeights = arch.sideCards.map(
    c => Math.max(0.5, c.avgCount) * (0.75 + rng() * 0.5)
  )
  const sideCounts = weightedSplit(CONSTRUCTED_SIDE, sideWeights)
  return arch.sideCards.map((c, i) => ({
    n: c.name,
    c: sideCounts[i],
    b: 'SIDE',
  }))
}

/** Sample DECKLIST_VARIANTS decklists from the archetype's adoption pools:
 *  per-card copy counts weighted by the card's avgCount, jittered per variant
 *  so the three lists differ. Non-land adoption rows split the spell slot
 *  while the archetype's canonical basics take a realistic land slot (the
 *  pools of most multi-color archetypes carry no basics). Constructed decks
 *  sum to 60 main + 15 side; Duel Commander to 99 + a single Commander in the
 *  sideboard slot (R6). */
function buildDeckLists(
  seed: string,
  slug: string,
  arch: RawArchetype,
  duel: boolean
): RawDeckList[] {
  const landNames = basicLands(colorLetters(arch.color))
  const spells = arch.mainCards.filter(c => !LAND_NAMES[c.name])
  const out: RawDeckList[] = []
  for (let v = 0; v < DECKLIST_VARIANTS; v++) {
    const rng = seedrandom(`${seed}-${slug}-deck-${v}`) as unknown as Rng
    const main = buildMainBoard(rng, arch, spells, landNames, duel)
    const side = buildSideBoard(rng, arch, duel)
    out.push({ main, side })
  }
  return out
}

/** Attach up to 8 recent-deck entries (KTD12) to one archetype-window: players
 *  and records come from the archetype's clustering units, events from the
 *  window's tournaments, and roughly one entry in eight has no published list
 *  (R9). Own seeded rng — the stats rng streams stay untouched so the committed
 *  report snapshot does not move. */
export function attachEntries(
  seed: string,
  arch: RawArchetype,
  tournaments: RawTournament[],
  duel: boolean
): void {
  const rng = seedrandom(`${seed}-${arch.slug}-entries`) as unknown as Rng
  const deckLists = buildDeckLists(seed, arch.slug, arch, duel)
  const nextRankByTournament = new Map<string, number>()
  const entries: RawEntry[] = []
  for (let i = 0; i < 8; i++) {
    const t = tournaments[Math.floor(rng() * tournaments.length)]
    const player = arch.players[i % arch.players.length]
    const hasCards = rng() >= 0.12
    const deck = hasCards ? Math.floor(rng() * deckLists.length) : null
    const id = uuidFromRng(rng)
    const rank =
      t.source === 'MTGO' ? (nextRankByTournament.get(t.id) ?? 0) + 1 : 0
    if (t.source === 'MTGO') nextRankByTournament.set(t.id, rank)
    const decklistUrl =
      deck !== null && rng() < 0.8
        ? `https://example.org/deck/${arch.slug}/${i + 1}`
        : null
    entries.push({
      id,
      tournamentId: t.id,
      player: player.p,
      rank,
      w: player.w,
      l: player.l,
      d: player.d,
      decklistUrl,
      deck,
    })
  }
  arch.entries = entries
  arch.deckLists = deckLists
}
