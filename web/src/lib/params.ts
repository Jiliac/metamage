import { cache } from 'react'
import { z } from 'zod'
import type {
  ArchetypeSlug,
  FormatSlug,
  IsoDate,
  MetaQuery,
  MetaSort,
} from '@/datasource/types'

// ---------------------------------------------------------------------------
// The URL is the single source of truth for view state. This module is the ONLY
// place that (de)serializes it: `parseMetaQuery` (searchParams → MetaQuery) and
// `buildHref` (MetaQuery → canonical URL). Both are pure so the canonical URL,
// the shareable URL, the OG URL and the ISR cache key all derive identically.
// ---------------------------------------------------------------------------

// ---- Brand casts (validation happens here, so callers get branded values) ----
export const asFormatSlug = (s: string): FormatSlug => s as FormatSlug
export const asArchetypeSlug = (s: string): ArchetypeSlug => s as ArchetypeSlug
export const asIsoDate = (s: string): IsoDate => s as IsoDate

// ---- Defaults + clamps (blueprint §2 table) ----
export const DEFAULTS = {
  topN: 20, // ?top
  matrixTopN: 12, // ?n (matrix route only)
  minMatches: 80, // ?min
  weight: 'match',
  hideBuckets: true, // ?buckets=hide
  sort: 'presence',
} as const satisfies {
  topN: number
  matrixTopN: number
  minMatches: number
  weight: MetaQuery['weight']
  hideBuckets: boolean
  sort: MetaSort
}

const CLAMP = {
  topN: { min: 1, max: 100 },
  matrixTopN: { min: 2, max: 30 },
  minMatches: { min: 0, max: 100_000 },
  add: { max: 30 }, // cap forced-in archetypes
} as const

// ---- zod schemas for the enumerated knobs (invalid input → default) ----
const weightSchema = z.enum(['match', 'entry']).catch(DEFAULTS.weight)
const bucketsSchema = z.enum(['hide', 'show']).catch('hide')
// Legacy `?sort=tier` (tier column removed) falls through `.catch` → default.
const sortSchema = z.enum(['presence', 'wrlo']).catch(DEFAULTS.sort)

// ---------------------------------------------------------------------------
// searchParams reader — accepts either a URLSearchParams (client) or the plain
// record Next.js hands RSC pages ({ [k]: string | string[] | undefined }).
// ---------------------------------------------------------------------------
export type SearchParamsInput =
  URLSearchParams | Record<string, string | string[] | undefined>

function readParam(sp: SearchParamsInput, key: string): string | undefined {
  if (sp instanceof URLSearchParams) {
    const v = sp.get(key)
    return v === null ? undefined : v
  }
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

// ---- Date helpers (UTC to avoid timezone drift in canonical URLs) ----

/**
 * Per-request clock. Within one RSC render, `parseMetaQuery` and every
 * `buildHref` call share the same `now`, so the default-window-omission check
 * cannot disagree with the parse across a month boundary mid-request (links
 * built at 23:59:59 vs parsed at 00:00:01 would otherwise flip). React's
 * `cache` memoizes per server request and is an identity pass-through on the
 * client, where the drift window is a single event handler tick.
 */
export const requestNow = cache((): Date => new Date())

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(d: Date): IsoDate {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}` as IsoDate
}

/** True when `raw` is a real calendar date in `YYYY-MM-DD` form. */
export function isValidIsoDate(raw: string | undefined): raw is string {
  if (!raw || !ISO_RE.test(raw)) return false
  const [y, m, d] = raw.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

/** The default window: first → last day of `now`'s month (inclusive). */
export function defaultWindow(now: Date = new Date()): {
  start: IsoDate
  end: IsoDate
} {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  return {
    start: toIso(new Date(Date.UTC(y, m, 1))),
    end: toIso(new Date(Date.UTC(y, m + 1, 0))),
  }
}

// ---- Preset expansion (UI sugar → start/end; never stored in the URL) ----
//
// Presets are rolling windows that END TODAY (inclusive; "today" is the UTC
// calendar day of `now`):
//   - `last-Nd` → the N calendar days ending today: start = today − (N − 1).
//                 "Last 7 days" on Sep 27 is Sep 21 → Sep 27.
//   - `last-Nm` → start = (same day-of-month N months back) + 1 day, so the
//                 window spans exactly N months without double-counting the
//                 anniversary day. If that day doesn't exist in the target
//                 month it is clamped to the month's last day before the +1
//                 (May 31 − 3 months → "Feb 31" → Feb 28 → +1 = Mar 1).
//                 "Last 3 months" on Sep 27 is Jun 28 → Sep 27.
export const PRESETS = [
  'last-7d',
  'last-14d',
  'last-30d',
  'last-3m',
  'last-6m',
] as const
export type Preset = (typeof PRESETS)[number]

export const PRESET_LABELS: Record<Preset, string> = {
  'last-7d': 'Last 7 days',
  'last-14d': 'Last 14 days',
  'last-30d': 'Last 30 days',
  'last-3m': 'Last 3 months',
  'last-6m': 'Last 6 months',
}

const PRESET_SPANS: Record<Preset, { days: number } | { months: number }> = {
  'last-7d': { days: 7 },
  'last-14d': { days: 14 },
  'last-30d': { days: 30 },
  'last-3m': { months: 3 },
  'last-6m': { months: 6 },
}

/** Expand a preset chip into an explicit inclusive `{ start, end }` window. */
export function expandPreset(
  preset: Preset,
  now: Date = requestNow()
): { start: IsoDate; end: IsoDate } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  const span = PRESET_SPANS[preset]
  let start: Date
  if ('days' in span) {
    start = new Date(Date.UTC(y, m, d - (span.days - 1)))
  } else {
    // Clamp the day-of-month into the target month, then step one day forward.
    const targetMonthLastDay = new Date(
      Date.UTC(y, m - span.months + 1, 0)
    ).getUTCDate()
    start = new Date(
      Date.UTC(y, m - span.months, Math.min(d, targetMonthLastDay) + 1)
    )
  }
  return { start: toIso(start), end: toIso(new Date(Date.UTC(y, m, d))) }
}

/** The preset whose expansion equals `{ start, end }` as of `now`, if any. */
export function matchPreset(
  window: { start: string; end: string },
  now: Date = requestNow()
): Preset | undefined {
  return PRESETS.find(p => {
    const w = expandPreset(p, now)
    return w.start === window.start && w.end === window.end
  })
}

// ---- Default-window chip ("This month") ----
//
// Returns the picker to `defaultWindow` (the current UTC calendar month). On
// the last day of a 30-day month "Last 30 days" expands to the same window, so
// `matchWindowChip` checks the default first: that window is the canonical
// landing (omitted from the URL), and highlighting both chips would be noise.
export const DEFAULT_WINDOW_CHIP = 'this-month'
export const DEFAULT_WINDOW_LABEL = 'This month'
export type WindowChip = typeof DEFAULT_WINDOW_CHIP | Preset

/** The chip to highlight for `{ start, end }` as of `now` (default first). */
export function matchWindowChip(
  window: { start: string; end: string },
  now: Date = requestNow()
): WindowChip | undefined {
  const def = defaultWindow(now)
  if (window.start === def.start && window.end === def.end) {
    return DEFAULT_WINDOW_CHIP
  }
  return matchPreset(window, now)
}

// ---- Numeric field: coerce → clamp → default on garbage ----
function intField(
  raw: string | undefined,
  def: number,
  min: number,
  max: number
): number {
  // Empty/blank input is not a number (Number('') === 0) — fall back to the
  // default rather than silently coercing to 0 and disabling clamped floors.
  if (raw === undefined || raw.trim() === '') {
    return Math.min(max, Math.max(min, def))
  }
  const parsed = z.coerce.number().int().safeParse(raw)
  const n = parsed.success ? parsed.data : def
  return Math.min(max, Math.max(min, n))
}

/** The canonical archetype slug discipline: lowercase alphanumerics joined by
 *  single hyphens, no leading/trailing hyphen. Shared by the `?add` parser and
 *  the `[slug]` route guard so malformed slugs never reach a data source. */
export const ARCHETYPE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** True when `raw` is a well-formed archetype slug. */
export function isArchetypeSlug(raw: string): boolean {
  return ARCHETYPE_SLUG_RE.test(raw)
}

function parseAdd(raw: string | undefined): ArchetypeSlug[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: ArchetypeSlug[] = []
  for (const part of raw.split(',')) {
    const s = part.trim().toLowerCase()
    if (s && isArchetypeSlug(s) && !seen.has(s)) {
      seen.add(s)
      out.push(asArchetypeSlug(s))
      if (out.length >= CLAMP.add.max) break
    }
  }
  return out
}

/**
 * Parse the shared lens from `searchParams`. Applies every default + clamp in
 * the blueprint §2 table. Never throws — invalid input silently falls back to
 * the canonical default. Usable in both RSC and client code.
 *
 * Note: `sort` (table-only) and `matrixTopN` / `n` (matrix-only) are NOT part of
 * the `MetaQuery` contract object; parse them with `parseSort` / `parseMatrixTopN`.
 */
export function parseMetaQuery(
  format: string,
  sp: SearchParamsInput,
  now: Date = requestNow()
): MetaQuery {
  const def = defaultWindow(now)
  const startRaw = readParam(sp, 'start')
  const endRaw = readParam(sp, 'end')
  let start = isValidIsoDate(startRaw) ? asIsoDate(startRaw) : def.start
  let end = isValidIsoDate(endRaw) ? asIsoDate(endRaw) : def.end
  // Lexicographic compare is valid for zero-padded ISO dates.
  if (start > end) {
    start = def.start
    end = def.end
  }
  return {
    format: asFormatSlug(format),
    start,
    end,
    topN: intField(
      readParam(sp, 'top'),
      DEFAULTS.topN,
      CLAMP.topN.min,
      CLAMP.topN.max
    ),
    minMatches: intField(
      readParam(sp, 'min'),
      DEFAULTS.minMatches,
      CLAMP.minMatches.min,
      CLAMP.minMatches.max
    ),
    includeArchetypes: parseAdd(readParam(sp, 'add')),
    hideBuckets:
      bucketsSchema.parse(readParam(sp, 'buckets') ?? 'hide') !== 'show',
    weight: weightSchema.parse(readParam(sp, 'weight') ?? DEFAULTS.weight),
  }
}

/** Table sort key (`?sort`), defaulting to `presence`. */
export function parseSort(sp: SearchParamsInput): MetaSort {
  return sortSchema.parse(readParam(sp, 'sort') ?? DEFAULTS.sort)
}

/** Matrix top-N (`?n`), matrix route only. */
export function parseMatrixTopN(sp: SearchParamsInput): number {
  return intField(
    readParam(sp, 'n'),
    DEFAULTS.matrixTopN,
    CLAMP.matrixTopN.min,
    CLAMP.matrixTopN.max
  )
}

export type BuildHrefOpts = {
  /** Appended after `/meta/{format}`, e.g. `/matrix` or `/archetype/{slug}`. */
  path?: string
  /** Table sort key (`?sort`), omitted when equal to the default. */
  sort?: MetaSort
  /** Matrix top-N (`?n`), omitted when equal to the default. */
  matrixTopN?: number
  /** Archetype-detail tab (`?tab`). */
  tab?: string
  /** Injected clock so the window-omission check is testable. */
  now?: Date
}

/**
 * Inverse of `parseMetaQuery`: serialize a `MetaQuery` (+ optional route extras)
 * to a canonical URL. Omits every param that equals its default so the default
 * landing is a clean `/meta/{format}`. Param order is fixed for stable canonical
 * / ISR-cache-key strings. `canonical URL == shareable URL == OG URL == cache key`.
 */
export function buildHref(
  format: FormatSlug | string,
  query: MetaQuery,
  opts: BuildHrefOpts = {}
): string {
  const def = defaultWindow(opts.now ?? requestNow())
  const params = new URLSearchParams()
  // Window is a pair: omit both when it matches the current-month default.
  if (!(query.start === def.start && query.end === def.end)) {
    params.set('start', query.start)
    params.set('end', query.end)
  }
  if (query.topN !== DEFAULTS.topN) params.set('top', String(query.topN))
  if (query.minMatches !== DEFAULTS.minMatches) {
    params.set('min', String(query.minMatches))
  }
  if (query.weight !== DEFAULTS.weight) params.set('weight', query.weight)
  if (query.hideBuckets !== DEFAULTS.hideBuckets) {
    params.set('buckets', query.hideBuckets ? 'hide' : 'show')
  }
  if (query.includeArchetypes.length) {
    params.set('add', query.includeArchetypes.join(','))
  }
  if (opts.sort && opts.sort !== DEFAULTS.sort) params.set('sort', opts.sort)
  if (
    opts.matrixTopN !== undefined &&
    opts.matrixTopN !== DEFAULTS.matrixTopN
  ) {
    params.set('n', String(opts.matrixTopN))
  }
  if (opts.tab) params.set('tab', opts.tab)

  const qs = params.toString()
  const base = `/meta/${format}${opts.path ?? ''}`
  return qs ? `${base}?${qs}` : base
}

/**
 * slug → archetype-detail href for every linkable row, preserving the lens.
 * Buckets ("unknown"/"conflict") have no detail page — the archetype route's
 * `generateStaticParams` and `MetaTable` never link them — so they get no entry.
 */
export function buildArchetypeHrefs(
  format: FormatSlug | string,
  query: MetaQuery,
  rows: ReadonlyArray<{ slug: string; isBucket: boolean }>,
  opts: Pick<BuildHrefOpts, 'now'> = {}
): Record<string, string> {
  return Object.fromEntries(
    rows
      .filter(r => !r.isBucket)
      .map(r => [
        String(r.slug),
        buildHref(format, query, {
          path: `/archetype/${r.slug}`,
          now: opts.now,
        }),
      ])
  )
}
