// ---------------------------------------------------------------------------
// Format chip order (left → right) = popularity by match count over the last
// 3 months, measured 2026-09-27: modern 29.4k, pauper 16.4k, standard 7.3k,
// duel-commander 5.9k, legacy 5.9k, pioneer 4.6k, vintage 2.7k.
// Hard-coded on purpose (stable UI); re-measure and edit when the field shifts.
// Formats not listed sort after these, alphabetically.
// ---------------------------------------------------------------------------

export const FORMAT_ORDER = [
  'modern',
  'pauper',
  'standard',
  'duel-commander',
  'legacy',
  'pioneer',
  'vintage',
] as const

/** Duel Commander has its own banlist committee (not Wizards). */
export const DUEL_COMMANDER_FORMAT =
  'duel-commander' satisfies (typeof FORMAT_ORDER)[number]

/** Landing format for `/` and format-less fallbacks: the most-played one. */
export const DEFAULT_FORMAT = FORMAT_ORDER[0]

function rankOf(slug: string): number {
  const i = (FORMAT_ORDER as readonly string[]).indexOf(slug)
  return i === -1 ? FORMAT_ORDER.length : i
}

/** Returns a new array sorted by FORMAT_ORDER, unknown slugs last (A→Z). */
export function sortFormats<T extends { slug: string }>(formats: T[]): T[] {
  return [...formats].sort(
    (a, b) => rankOf(a.slug) - rankOf(b.slug) || a.slug.localeCompare(b.slug)
  )
}
