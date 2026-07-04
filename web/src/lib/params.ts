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
const sortSchema = z.enum(['presence', 'wrlo', 'tier']).catch(DEFAULTS.sort)

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
export const PRESETS = [
  'this-month',
  'last-month',
  'last-3-months',
  'last-6-months',
  'ytd',
  'q1',
  'q2',
  'q3',
  'q4',
] as const
export type Preset = (typeof PRESETS)[number]

export const PRESET_LABELS: Record<Preset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-3-months': 'Last 3 months',
  'last-6-months': 'Last 6 months',
  ytd: 'Year to date',
  q1: 'Q1',
  q2: 'Q2',
  q3: 'Q3',
  q4: 'Q4',
}

/** Expand a preset chip into an explicit inclusive `{ start, end }` window. */
export function expandPreset(
  preset: Preset,
  now: Date = new Date()
): { start: IsoDate; end: IsoDate } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const monthWindow = (year: number, month: number) => ({
    start: toIso(new Date(Date.UTC(year, month, 1))),
    end: toIso(new Date(Date.UTC(year, month + 1, 0))),
  })
  switch (preset) {
    case 'this-month':
      return monthWindow(y, m)
    case 'last-month':
      return monthWindow(y, m - 1)
    case 'last-3-months':
      return {
        start: toIso(new Date(Date.UTC(y, m - 2, 1))),
        end: toIso(new Date(Date.UTC(y, m + 1, 0))),
      }
    case 'last-6-months':
      return {
        start: toIso(new Date(Date.UTC(y, m - 5, 1))),
        end: toIso(new Date(Date.UTC(y, m + 1, 0))),
      }
    case 'ytd':
      return { start: toIso(new Date(Date.UTC(y, 0, 1))), end: toIso(now) }
    case 'q1':
      return { start: toIso(new Date(Date.UTC(y, 0, 1))), end: toIso(new Date(Date.UTC(y, 3, 0))) } // prettier-ignore
    case 'q2':
      return { start: toIso(new Date(Date.UTC(y, 3, 1))), end: toIso(new Date(Date.UTC(y, 6, 0))) } // prettier-ignore
    case 'q3':
      return { start: toIso(new Date(Date.UTC(y, 6, 1))), end: toIso(new Date(Date.UTC(y, 9, 0))) } // prettier-ignore
    case 'q4':
      return { start: toIso(new Date(Date.UTC(y, 9, 1))), end: toIso(new Date(Date.UTC(y, 12, 0))) } // prettier-ignore
  }
}

// ---- Numeric field: coerce → clamp → default on garbage ----
function intField(
  raw: string | undefined,
  def: number,
  min: number,
  max: number
): number {
  const parsed = z.coerce.number().int().safeParse(raw)
  const n = parsed.success ? parsed.data : def
  return Math.min(max, Math.max(min, n))
}

function parseAdd(raw: string | undefined): ArchetypeSlug[] {
  if (!raw) return []
  const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const seen = new Set<string>()
  const out: ArchetypeSlug[] = []
  for (const part of raw.split(',')) {
    const s = part.trim().toLowerCase()
    if (s && slugRe.test(s) && !seen.has(s)) {
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
  now: Date = new Date()
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
  const def = defaultWindow(opts.now ?? new Date())
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
