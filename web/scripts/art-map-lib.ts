/**
 * art-map-lib.ts — the pure, side-effect-free parts of gen-archetype-art.ts
 * (argv parsing, override validation/merge, Scryfall response matching,
 * deterministic map serialisation). No I/O, no process access, no module
 * top-level effects, so everything here is unit-testable.
 */

import { FORMAT_ORDER } from '../src/datasource/format-order'
import { type CardCandidate, pickSignatureCard } from './signature-card'

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

/** Locale-independent string order (UTF-16 code units), for stable output. */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  return a > b ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function slugifyArchetype(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

export const FILL_GAPS_FLAG = '--fill-gaps'
export const DRY_RUN_FLAG = '--dry-run'
export const STRICT_FLAG = '--strict'
export const HELP_FLAGS: readonly string[] = ['--help', '-h']
export const REPORT_PREFIX = '--report='

export const DEFAULT_REPORT_FORMATS: readonly string[] = [
  'modern',
  'legacy',
  'pioneer',
  'pauper',
  'standard',
]
export const VALID_REPORT_FORMATS: readonly string[] = FORMAT_ORDER

export type CliOptions = {
  help: boolean
  fillGaps: boolean
  dryRun: boolean
  strict: boolean
  reportFormats: readonly string[]
}

export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; error: string }

export const USAGE = `usage: tsx scripts/gen-archetype-art.ts [options]

Regenerates src/datasource/art-map.json from the tournament DB + Scryfall.

options:
  ${FILL_GAPS_FLAG}      seed from the existing art-map.json and fetch only the
                   card names still unresolved; the existing map must be
                   readable (unless combined with ${DRY_RUN_FLAG})
  ${DRY_RUN_FLAG}        print the before/after signature report; write nothing
  ${STRICT_FLAG}         exit non-zero (before fetching/writing) when an override
                   is unused or names a card that is not among its
                   archetype's candidate cards
  ${REPORT_PREFIX}a,b     formats in the before/after report; at most once
                   default: ${DEFAULT_REPORT_FORMATS.join(',')}
                   valid:   ${VALID_REPORT_FORMATS.join(',')}
  -h, --help       show this help and exit`

/** `--report=` value → format list. An empty list or entry and unknown
 *  formats are errors; duplicates are dropped (first occurrence kept). */
export function parseReportArg(
  value: string,
  validFormats: readonly string[] = VALID_REPORT_FORMATS
): ParseResult<string[]> {
  const parts = value.split(',').map(p => p.trim())
  if (parts.some(p => p === ''))
    return {
      ok: false,
      error: `${REPORT_PREFIX} needs a comma-separated list of formats (got "${value}")`,
    }
  const unknown = parts.filter(p => !validFormats.includes(p))
  if (unknown.length > 0)
    return {
      ok: false,
      error: `unknown report format(s): ${unknown.join(', ')}; valid: ${validFormats.join(', ')}`,
    }
  return { ok: true, value: [...new Set(parts)] }
}

export function parseCliArgs(argv: readonly string[]): ParseResult<CliOptions> {
  const reportArgs = argv.filter(a => a.startsWith(REPORT_PREFIX))
  const unknownArgs = argv.filter(
    a =>
      a !== FILL_GAPS_FLAG &&
      a !== DRY_RUN_FLAG &&
      a !== STRICT_FLAG &&
      !HELP_FLAGS.includes(a) &&
      !a.startsWith(REPORT_PREFIX)
  )
  if (unknownArgs.length > 0)
    return { ok: false, error: `unknown argument(s): ${unknownArgs.join(' ')}` }
  if (reportArgs.length > 1)
    return { ok: false, error: `${REPORT_PREFIX} may be given at most once` }
  let reportFormats: readonly string[] = DEFAULT_REPORT_FORMATS
  if (reportArgs.length === 1) {
    const parsed = parseReportArg(reportArgs[0].slice(REPORT_PREFIX.length))
    if (!parsed.ok) return parsed
    reportFormats = parsed.value
  }
  return {
    ok: true,
    value: {
      help: argv.some(a => HELP_FLAGS.includes(a)),
      fillGaps: argv.includes(FILL_GAPS_FLAG),
      dryRun: argv.includes(DRY_RUN_FLAG),
      strict: argv.includes(STRICT_FLAG),
      reportFormats,
    },
  }
}

// ---------------------------------------------------------------------------
// DB rows
// ---------------------------------------------------------------------------

export type CandidateRow = {
  format_name: string
  arch_name: string
  card_name: string
  is_land: boolean
  decks: number
  copies: number
  arch_decks: number
  fmt_card_decks: number
  fmt_decks: number
  recent_90: number
}

const STRING_COLUMNS = ['format_name', 'arch_name', 'card_name'] as const
const NUMBER_COLUMNS = [
  'decks',
  'copies',
  'arch_decks',
  'fmt_card_decks',
  'fmt_decks',
  'recent_90',
] as const

function isCandidateRow(row: unknown): row is CandidateRow {
  return (
    isRecord(row) &&
    typeof row.is_land === 'boolean' &&
    STRING_COLUMNS.every(c => typeof row[c] === 'string') &&
    NUMBER_COLUMNS.every(c => Number.isFinite(row[c]))
  )
}

/** Runtime shape check on the raw query result; throws on the first bad row
 *  so a schema drift fails loudly instead of producing a garbage map. */
export function parseCandidateRows(rows: readonly unknown[]): CandidateRow[] {
  const bad = rows.findIndex(row => !isCandidateRow(row))
  if (bad !== -1)
    throw new Error(
      `unexpected candidate row shape at index ${bad}: ${JSON.stringify(rows[bad])}`
    )
  return rows.filter(isCandidateRow)
}

// ---------------------------------------------------------------------------
// overrides
// ---------------------------------------------------------------------------

/** format name → lower-cased archetype name → card name. */
export type Overrides = Readonly<
  Record<string, Readonly<Record<string, string>>>
>

/**
 * Validates archetype-art-overrides.json: an object of format → object of
 * archetype → non-empty card name. Top-level keys starting with `_` are
 * comments. Archetype keys are lower-cased (and trimmed) so "Prowess" matches;
 * two keys colliding after that is an error. Throws with a path to the
 * offending entry.
 */
export function parseOverrides(raw: unknown): Overrides {
  if (!isRecord(raw))
    throw new Error('overrides: expected a JSON object of format -> entries')
  const out: Record<string, Record<string, string>> = {}
  for (const [format, entries] of Object.entries(raw)) {
    if (format.startsWith('_')) continue
    if (!isRecord(entries))
      throw new Error(
        `overrides.${format}: expected an object of archetype -> card name`
      )
    const normalised: Record<string, string> = {}
    for (const [arch, card] of Object.entries(entries)) {
      if (typeof card !== 'string' || card.trim() === '')
        throw new Error(
          `overrides.${format}["${arch}"]: expected a non-empty card name string, got ${JSON.stringify(card)}`
        )
      const key = arch.trim().toLowerCase()
      if (Object.hasOwn(normalised, key))
        throw new Error(
          `overrides.${format}: "${arch}" duplicates another key once lower-cased ("${key}")`
        )
      normalised[key] = card.trim()
    }
    out[format] = normalised
  }
  return out
}

// ---------------------------------------------------------------------------
// signatures (heuristic + overrides)
// ---------------------------------------------------------------------------

export type Signature = {
  formatName: string
  archName: string
  cardName: string
  /** decks in the archetype's window; decides slug collisions */
  archDecks: number
  recent90: number
  overridden: boolean
}

export type OverrideMismatch = {
  format: string
  archetype: string
  cardName: string
}

export type SignaturePick = {
  /** sorted by format, then archetype name */
  signatures: Signature[]
  /** `format/archetype` override keys whose archetype is not in the data */
  unusedOverrides: string[]
  /** overrides whose card is not among the archetype's candidate cards
   *  (likely misspelled — it would resolve to null art) */
  mismatchedOverrides: OverrideMismatch[]
}

function toCandidate(r: CandidateRow): CardCandidate {
  return {
    cardName: r.card_name,
    isLand: r.is_land,
    decks: r.decks,
    copies: r.copies,
    archDecks: r.arch_decks,
    fmtCardDecks: r.fmt_card_decks,
    fmtDecks: r.fmt_decks,
  }
}

export function pickSignatures(
  rows: readonly CandidateRow[],
  overrides: Overrides
): SignaturePick {
  const groups = new Map<string, CandidateRow[]>()
  for (const row of rows) {
    const key = `${row.format_name}\u0000${row.arch_name}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  const signatures: Signature[] = []
  const usedOverrides = new Set<string>()
  const mismatchedOverrides: OverrideMismatch[] = []
  for (const group of groups.values()) {
    const { format_name: formatName, arch_name: archName } = group[0]
    const archKey = archName.toLowerCase()
    const candidates = group.map(toCandidate)
    const override = overrides[formatName]?.[archKey]
    let picked: string | undefined
    if (override !== undefined) {
      usedOverrides.add(`${formatName}/${archKey}`)
      // prefer the DB's spelling of the card when the override matches one
      const match = candidates.find(
        c => c.cardName.toLowerCase() === override.toLowerCase()
      )
      if (!match)
        mismatchedOverrides.push({
          format: formatName,
          archetype: archKey,
          cardName: override,
        })
      picked = match?.cardName ?? override
    } else {
      picked = pickSignatureCard(archName, candidates)?.cardName
    }
    if (!picked) continue
    signatures.push({
      formatName,
      archName,
      cardName: picked,
      archDecks: group[0].arch_decks,
      recent90: group[0].recent_90,
      overridden: override !== undefined,
    })
  }
  const unusedOverrides = Object.entries(overrides)
    .flatMap(([format, entries]) =>
      Object.keys(entries).map(arch => `${format}/${arch}`)
    )
    .filter(key => !usedOverrides.has(key))
    .sort(compareStrings)
  return {
    signatures: signatures.sort(
      (a, b) =>
        compareStrings(a.formatName, b.formatName) ||
        compareStrings(a.archName, b.archName)
    ),
    unusedOverrides,
    mismatchedOverrides,
  }
}

/** Distinct signature card names keyed by lower-case, excluding `known`. */
export function cardsToFetch(
  signatures: readonly Signature[],
  known: ReadonlyMap<string, unknown>
): { distinct: number; toFetch: string[] } {
  const canonical = new Map<string, string>()
  for (const s of signatures)
    canonical.set(s.cardName.toLowerCase(), s.cardName)
  const toFetch = [...canonical]
    .filter(([lower]) => !known.has(lower))
    .map(([, name]) => name)
  return { distinct: canonical.size, toFetch }
}

// ---------------------------------------------------------------------------
// Scryfall
// ---------------------------------------------------------------------------

export const SCRYFALL_ART_HOST = 'cards.scryfall.io'
export const MAX_RETRY_WAIT_MS = 120_000
/** Scryfall's 429 cooldown is 60s per its error message. */
export const DEFAULT_RATE_LIMIT_WAIT_MS = 61_000

export type ScryfallCard = {
  name?: unknown
  image_uris?: { art_crop?: unknown } | null
  card_faces?: ReadonlyArray<{ image_uris?: { art_crop?: unknown } | null }>
}

/** Only https URLs on Scryfall's image CDN are ever written to the map. */
export function isScryfallArtUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !URL.canParse(value)) return false
  const url = new URL(value)
  return url.protocol === 'https:' && url.hostname === SCRYFALL_ART_HOST
}

/** Art crop of a card, front face for double-faced cards; null when absent
 *  or not a Scryfall CDN https URL. */
export function extractArtCrop(card: ScryfallCard): string | null {
  const faces = Array.isArray(card.card_faces) ? card.card_faces : []
  const url = card.image_uris?.art_crop ?? faces[0]?.image_uris?.art_crop
  return isScryfallArtUrl(url) ? url : null
}

/** Scryfall matches double-faced/split cards by front-face name; the DB
 *  stores the full "A // B" name. Key everything by the front face. */
export function frontFace(name: string): string {
  return name.split(' // ')[0].toLowerCase()
}

export function collectionIdentifiers(
  names: readonly string[]
): Array<{ name: string }> {
  return names.map(name => ({ name: name.split(' // ')[0] }))
}

/** The `data` array of a /cards/collection response; null when the body is
 *  not the expected shape (treated as a failed chunk by the caller). */
export function parseCollectionBody(body: unknown): ScryfallCard[] | null {
  if (!isRecord(body) || !Array.isArray(body.data)) return null
  return body.data.filter(isRecord)
}

/**
 * lower-cased requested name → art crop URL, for every requested name. Only a
 * returned card whose front-face name equals a requested front face counts
 * (exact-name guard); anything else, or a name Scryfall did not return, maps
 * to null.
 */
export function matchArtCrops(
  requested: readonly string[],
  cards: readonly ScryfallCard[]
): Map<string, string | null> {
  const artByFront = new Map<string, string | null>()
  for (const card of cards)
    if (typeof card.name === 'string')
      artByFront.set(frontFace(card.name), extractArtCrop(card))
  return new Map(
    requested.map(name => [
      name.toLowerCase(),
      artByFront.get(frontFace(name)) ?? null,
    ])
  )
}

/** Wait before retrying a 429: Retry-After seconds when given, else 61s;
 *  capped at MAX_RETRY_WAIT_MS. */
export function rateLimitDelayMs(retryAfter: string | null): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter)
  const ms =
    Number.isFinite(seconds) && seconds > 0
      ? seconds * 1000
      : DEFAULT_RATE_LIMIT_WAIT_MS
  return Math.min(ms, MAX_RETRY_WAIT_MS)
}

/** Exponential backoff for transient network errors (2s, 4s, 8s, …),
 *  capped at MAX_RETRY_WAIT_MS. */
export function networkBackoffMs(attempt: number): number {
  return Math.min(2000 * 2 ** attempt, MAX_RETRY_WAIT_MS)
}

// ---------------------------------------------------------------------------
// art map (previous + next)
// ---------------------------------------------------------------------------

export type ArtEntry = { cardName: string; artCropUrl: string | null }
export type ArtMapFormats = Record<string, Record<string, ArtEntry>>
export type ArtMap = { generatedAt: string; formats: ArtMapFormats }

/** A map read back from disk: only the envelope is trusted, entries are
 *  validated where they are used. */
export type PreviousArtMap = {
  formats: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

/** Parses art-map.json text; throws on invalid JSON (e.g. merge-conflict
 *  markers) or a missing `formats` object. */
export function parsePreviousMap(text: string): PreviousArtMap {
  const raw: unknown = JSON.parse(text)
  if (!isRecord(raw) || !isRecord(raw.formats))
    throw new Error('expected an object with a "formats" object')
  const formats = Object.fromEntries(
    Object.entries(raw.formats).filter(
      (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])
    )
  )
  return { formats }
}

export type PreviousMapRead =
  { ok: true; map: PreviousArtMap } | { ok: false; reason: string }

/**
 * What to do with the existing map. Outside --fill-gaps a missing/unreadable
 * map only degrades the before/after report (warning). Under --fill-gaps it
 * is the seed, so it is a hard error — except with --dry-run, which proceeds
 * with an empty seed since nothing is written.
 */
export function resolvePreviousMap(
  read: PreviousMapRead,
  opts: Pick<CliOptions, 'fillGaps' | 'dryRun'>
): { previous: PreviousArtMap | null; warning: string | null } {
  if (read.ok) return { previous: read.map, warning: null }
  if (!opts.fillGaps)
    return {
      previous: null,
      warning: `${read.reason}; the report will show no previous signatures`,
    }
  if (opts.dryRun)
    return {
      previous: null,
      warning: `${read.reason}; ${FILL_GAPS_FLAG} ${DRY_RUN_FLAG} proceeds with an empty seed`,
    }
  throw new Error(
    `${FILL_GAPS_FLAG} requires a readable art map: ${read.reason}; run a full generation first`
  )
}

export function previousCardName(
  previous: PreviousArtMap | null,
  format: string,
  slug: string
): string | null {
  const entry = previous?.formats[format]?.[slug]
  return isRecord(entry) && typeof entry.cardName === 'string'
    ? entry.cardName
    : null
}

/**
 * Seed for --fill-gaps: every valid artCropUrl in the previous map, keyed by
 * lower-cased cardName. Null/invalid URLs are left out so they get
 * re-fetched; entries without a string cardName are reported in `skipped`
 * (`format/slug`) instead of throwing.
 */
export function seedFromPreviousMap(previous: PreviousArtMap | null): {
  seed: Map<string, string>
  skipped: string[]
} {
  const seed = new Map<string, string>()
  const skipped: string[] = []
  for (const [format, entries] of Object.entries(previous?.formats ?? {}))
    for (const [slug, entry] of Object.entries(entries)) {
      if (!isRecord(entry) || typeof entry.cardName !== 'string') {
        skipped.push(`${format}/${slug}`)
        continue
      }
      if (isScryfallArtUrl(entry.artCropUrl))
        seed.set(entry.cardName.toLowerCase(), entry.artCropUrl)
    }
  return { seed, skipped }
}

export type SlugCollision = {
  format: string
  slug: string
  kept: string
  dropped: string[]
}

/** More decks wins, then archetype name (code-unit order). */
function compareCollisionWinner(a: Signature, b: Signature): number {
  return b.archDecks - a.archDecks || compareStrings(a.archName, b.archName)
}

/**
 * format → slug → entry. When several archetypes of a format slugify to the
 * same key, the one with more decks (then the lower name) wins and the rest
 * are reported in `collisions` — independent of input order.
 */
export function buildArtMapFormats(
  signatures: readonly Signature[],
  artByLower: ReadonlyMap<string, string | null>
): { formats: ArtMapFormats; collisions: SlugCollision[] } {
  const bySlug = new Map<string, Signature[]>()
  for (const s of signatures) {
    const key = `${s.formatName}\u0000${slugifyArchetype(s.archName)}`
    const group = bySlug.get(key)
    if (group) group.push(s)
    else bySlug.set(key, [s])
  }
  const formats: ArtMapFormats = {}
  const collisions: SlugCollision[] = []
  for (const [key, group] of bySlug) {
    const [format, slug] = key.split('\u0000')
    const [winner, ...losers] = [...group].sort(compareCollisionWinner)
    if (losers.length > 0)
      collisions.push({
        format,
        slug,
        kept: winner.archName,
        dropped: losers.map(l => l.archName),
      })
    formats[format] = {
      ...formats[format],
      [slug]: {
        cardName: winner.cardName,
        artCropUrl: artByLower.get(winner.cardName.toLowerCase()) ?? null,
      },
    }
  }
  return {
    formats,
    collisions: collisions.sort(
      (a, b) =>
        compareStrings(a.format, b.format) || compareStrings(a.slug, b.slug)
    ),
  }
}

function sortedRecord<T>(
  record: Readonly<Record<string, T>>
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => compareStrings(a, b))
  )
}

/** art-map.json text with formats and, per format, slugs in code-unit order
 *  so regenerations on the same data diff cleanly. */
export function serializeArtMap(map: ArtMap): string {
  const formats = Object.fromEntries(
    Object.entries(sortedRecord(map.formats)).map(([format, entries]) => [
      format,
      sortedRecord(entries),
    ])
  )
  return (
    JSON.stringify({ generatedAt: map.generatedAt, formats }, null, 2) + '\n'
  )
}
