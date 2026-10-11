import type { DeckCardDTO, DeckSummaryDTO } from '@/datasource/types'
import { ARCHETYPE_ENTRIES_CAP } from '@/datasource/types'

// ---------------------------------------------------------------------------
// Pure deck logic for the Decklists tab (plan §U5): featured pick (KTD4),
// event grouping, recent-decks paging (KTD8), type bucketing (KTD5), and the
// record/placing label (R2/R9). No React, no data access — callers hand in
// DTOs from the datasource and get plain values back.
// ---------------------------------------------------------------------------

// ---- Featured pick (KTD4) ----

const FEATURED_WINDOW_DAYS = 14 // "most match points, last 14 days of play"
const DAY_MS = 86_400_000

/** Match points: 3·wins + draws, with nulls as 0 (KTD4). */
export function featuredPoints(entry: DeckSummaryDTO): number {
  return 3 * (entry.wins || 0) + (entry.draws || 0)
}

/** Higher score, then newer date, then lower nonzero rank (0/null last), then
 *  lower entry id (KTD4 tie-breaks). */
function compareCandidates(a: DeckSummaryDTO, b: DeckSummaryDTO): number {
  const pa = featuredPoints(a)
  const pb = featuredPoints(b)
  if (pa !== pb) return pb - pa
  if (a.event.date !== b.event.date) {
    return a.event.date < b.event.date ? 1 : -1
  }
  const ra = a.rank ?? 0
  const rb = b.rank ?? 0
  const wa = ra > 0 ? ra : Number.POSITIVE_INFINITY
  const wb = rb > 0 ? rb : Number.POSITIVE_INFINITY
  if (wa !== wb) return wa - wb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The featured deck: the highest 3·wins+draws entry among the archetype's
 * entries with deck cards, inside the 14-day window ending at the anchor —
 * the NEWEST tournament date among those entries, never today (KTD4).
 * Entries without cards are never candidates. No candidates → null.
 */
export function pickFeaturedDeck(
  entries: readonly DeckSummaryDTO[]
): DeckSummaryDTO | null {
  const candidates = entries.filter(e => e.hasCards)
  if (candidates.length === 0) return null
  const anchor = candidates.reduce(
    (max, e) => (e.event.date > max ? e.event.date : max),
    candidates[0].event.date
  )
  // Anchor day − 13 (UTC calendar days), re-serialized as ISO: toISOString is
  // always UTC, so slicing its date part is exact for a whole-day offset.
  const [ay, am, ad] = anchor.split('-').map(Number)
  const windowStart = new Date(
    Date.UTC(ay, am - 1, ad) - (FEATURED_WINDOW_DAYS - 1) * DAY_MS
  )
    .toISOString()
    .slice(0, 10)
  const inWindow = candidates.filter(
    e => e.event.date >= windowStart && e.event.date <= anchor
  )
  return inWindow.reduce((best, e) =>
    compareCandidates(e, best) < 0 ? e : best
  )
}

// ---- Recent-decks column (R9) ----

export type EventGroup = {
  event: DeckSummaryDTO['event']
  entries: DeckSummaryDTO[]
}

/**
 * Group the recent-decks rows by their event, preserving the input order —
 * `getArchetypeEntries` returns rows newest first, so events come out newest
 * first too. Entries of the same event stay adjacent; events on the same day
 * keep their first-appearance order.
 */
export function groupEntriesByEvent(
  entries: readonly DeckSummaryDTO[]
): EventGroup[] {
  const byId = new Map<string, EventGroup>()
  for (const entry of entries) {
    let group = byId.get(entry.event.id)
    if (!group) {
      group = { event: entry.event, entries: [] }
      byId.set(entry.event.id, group)
    }
    group.entries.push(entry)
  }
  return [...byId.values()]
}

// ---- Recent-decks paging (KTD8, R12) ----

/** `?decks=<n>` shows the newest 50·n entries. */
export const DECKS_PAGE_SIZE = 50

/** The cap bounds the page count: 2,000 rows / 50 per page. */
export const MAX_DECKS_PAGE = Math.ceil(ARCHETYPE_ENTRIES_CAP / DECKS_PAGE_SIZE)

export type DecksPage = {
  /** The newest `shown` entries, sliced from the cached list (KTD8). */
  visible: DeckSummaryDTO[]
  /** How many of the newest decks are rendered so far. */
  shown: number
  /** The uncapped total (R12). */
  total: number
  /** Whether a "Show older decks" control should render. */
  hasMore: boolean
  /** True when the loaded rows hit the cap and more decks exist in total —
   *  the list then ends with the cap note and no further page (R12). */
  capReached: boolean
}

/**
 * Slice the cached recent-decks list for page `p` (1-based). The RSC payload
 * carries only the rendered rows; no API route or client fetching (KTD8).
 */
export function sliceRecentDecks(
  entries: readonly DeckSummaryDTO[],
  total: number,
  page: number
): DecksPage {
  const p = Math.min(Math.max(1, Math.floor(page) || 1), MAX_DECKS_PAGE)
  const shown = Math.min(p * DECKS_PAGE_SIZE, entries.length)
  const capReached =
    entries.length >= ARCHETYPE_ENTRIES_CAP && total > entries.length
  return {
    visible: entries.slice(0, shown),
    shown,
    total,
    hasMore: shown < entries.length,
    capReached,
  }
}

/** 12345 → "12,345" (deterministic; no ICU dependence). */
export function formatInt(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** R11: a selected deck is outside the lens when its tournament date (UTC
 *  calendar day) falls before `start` or after `end`, both inclusive — the
 *  same bounds the window queries use. Decided by date, not by membership in
 *  the loaded entries, which are capped at ARCHETYPE_ENTRIES_CAP. */
export function isOutsideWindow(
  date: string,
  window: { start: string; end: string }
): boolean {
  return date < window.start || date > window.end
}

/** R12's end-of-list note past the cap: "Showing the newest 2,000 of 3,041". */
export function decksCapLabel(shown: number, total: number): string {
  return `Showing the newest ${formatInt(shown)} of ${formatInt(total)} decks`
}

// ---- Type bucketing (KTD5, R3/R4) ----

export type DeckTypeKey =
  | 'creatures'
  | 'planeswalkers'
  | 'battles'
  | 'instants'
  | 'sorceries'
  | 'artifacts'
  | 'enchantments'
  | 'lands'
  | 'other'

/** Display order for the maindeck groups (origin §1, R3). */
const GROUP_ORDER: readonly DeckTypeKey[] = [
  'creatures',
  'planeswalkers',
  'battles',
  'instants',
  'sorceries',
  'artifacts',
  'enchantments',
  'lands',
  'other',
]

const GROUP_LABELS: Record<DeckTypeKey, string> = {
  creatures: 'Creatures',
  planeswalkers: 'Planeswalkers',
  battles: 'Battles',
  instants: 'Instants',
  sorceries: 'Sorceries',
  artifacts: 'Artifacts',
  enchantments: 'Enchantments',
  lands: 'Lands',
  other: 'Other',
}

/**
 * Multi-type priority: a card appears exactly once, in the FIRST matching
 * bucket of Land > Creature > Planeswalker > Battle > Artifact > Enchantment >
 * Instant > Sorcery (origin §2, KTD5). Word-boundary matching so
 * "Battlefield" never reads as Battle.
 */
const BUCKET_PRIORITY: readonly Exclude<DeckTypeKey, 'other'>[] = [
  'lands',
  'creatures',
  'planeswalkers',
  'battles',
  'artifacts',
  'enchantments',
  'instants',
  'sorceries',
]

const BUCKET_RE: Record<Exclude<DeckTypeKey, 'other'>, RegExp> = {
  lands: /\bLand\b/,
  creatures: /\bCreature\b/,
  planeswalkers: /\bPlaneswalker\b/,
  battles: /\bBattle\b/,
  artifacts: /\bArtifact\b/,
  enchantments: /\bEnchantment\b/,
  instants: /\bInstant\b/,
  sorceries: /\bSorcery\b/,
}

/** The bucket for one card's front-face type line, or 'other' when the row
 *  has no stored type data (R5). Split-face leftovers ("Instant // Land")
 *  bucket on the text before the separator. */
export function deckTypeBucket(typeLine: string | null): DeckTypeKey {
  if (!typeLine) return 'other'
  const front = typeLine.split('//')[0]
  for (const key of BUCKET_PRIORITY) {
    if (BUCKET_RE[key].test(front)) return key
  }
  return 'other'
}

export type DeckTypeGroup = {
  key: DeckTypeKey
  label: string
  /** Summed copies across the group's rows (origin §2). */
  count: number
  cards: DeckCardDTO[]
}

function byCmcThenName(a: DeckCardDTO, b: DeckCardDTO): number {
  const ca = a.cmc ?? Number.POSITIVE_INFINITY
  const cb = b.cmc ?? Number.POSITIVE_INFINITY
  if (ca !== cb) return ca - cb
  const na = a.name.toLowerCase()
  const nb = b.name.toLowerCase()
  return na < nb ? -1 : na > nb ? 1 : 0
}

/** Missing card data (cmc null) sinks below costed cards, by name. */
function byCountThenName(a: DeckCardDTO, b: DeckCardDTO): number {
  if (a.count !== b.count) return b.count - a.count
  const na = a.name.toLowerCase()
  const nb = b.name.toLowerCase()
  return na < nb ? -1 : na > nb ? 1 : 0
}

/**
 * Group the maindeck rows into the fixed display order (R3), summing counts
 * per group (origin §2). Only non-empty groups are returned. Within a group,
 * cards sort by cmc, then name. Rows without stored type data land in
 * "Other" (R5).
 */
export function groupMaindeck(cards: readonly DeckCardDTO[]): DeckTypeGroup[] {
  const buckets = new Map<DeckTypeKey, DeckCardDTO[]>()
  for (const card of cards) {
    const key = deckTypeBucket(card.typeLine)
    const rows = buckets.get(key)
    if (rows) rows.push(card)
    else buckets.set(key, [card])
  }
  return GROUP_ORDER.filter(k => buckets.has(k)).map(key => {
    const rows = buckets.get(key)!
    return {
      key,
      label: GROUP_LABELS[key],
      count: rows.reduce((sum, c) => sum + c.count, 0),
      cards: [...rows].sort(byCmcThenName),
    }
  })
}

/** Sideboard renders as one flat list, count descending, then name (R6). */
export function sortSideboard(cards: readonly DeckCardDTO[]): DeckCardDTO[] {
  return [...cards].sort(byCountThenName)
}

// ---- Placing / record label (R2, R9) ----

function ordinal(n: number): string {
  const mod100 = n % 100
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}

/**
 * "placing (MTGO rank when present) or W-L-D record": rank 1 → "1st"; rank
 * 0/null with any games → "5-1-0"; an all-zero row (Melee/unranked without a
 * published record) gets no label.
 */
export function placingOrRecord(
  entry: Pick<DeckSummaryDTO, 'rank' | 'wins' | 'losses' | 'draws'>
): string | null {
  const rank = entry.rank ?? 0
  if (rank > 0) return ordinal(rank)
  if (entry.wins || entry.losses || entry.draws) {
    return `${entry.wins}-${entry.losses}-${entry.draws}`
  }
  return null
}
