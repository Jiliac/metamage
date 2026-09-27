import { cache } from 'react'

import {
  ARCHETYPES_SQL,
  FORMAT_ID_SQL,
  KPI_SQL,
  MATCHUPS_SQL,
  PLAYER_RECORDS_SQL,
  type ArchetypeRow,
  type FormatRow,
  type KpiRow,
  type MatchupRow,
  type PlayerRow,
} from '@/datasource/postgres/sql'

// ---------------------------------------------------------------------------
// Per-request memoized raw loaders for the window aggregates whose SQL depends
// ONLY on (formatId, start, end) — never on the lens knobs (topN, minMatches,
// includeArchetypes, hideBuckets, weight, matrixTopN), which are applied in TS
// afterwards (@/datasource/derive).
//
// Why React `cache()` and not a nested `unstable_cache`: on Next 15.5.2 the
// outer `withCache` wrapper in @/datasource/index.ts already runs every
// DataSource method inside `unstable_cache`, and Next's implementation
// (node_modules/next/dist/server/web/spec-extension/unstable-cache.js) sets
// `isNestedUnstableCache = true` for any unstable_cache invoked while the
// work-unit store type is 'unstable-cache' and then BYPASSES the incremental
// cache ("when we are nested inside of other unstable_cache's we should bypass
// cache similar to fetches"). A nested unstable_cache here would therefore be
// a silent no-op. React `cache()` dedupes per server request regardless of
// the surrounding store: one cold landing render that misses both the
// getMetaReport and getMatchupMatrix DTO entries runs KPI_SQL,
// PLAYER_RECORDS_SQL, ARCHETYPES_SQL and FORMAT_ID_SQL once instead of
// twice/thrice. Outside a React request (scripts, vitest) `cache()` is a
// pass-through, so nothing here changes behavior there.
//
// Each wrapper awaits the postgres.js pending query so the memoized value is a
// settled-once Promise, not a re-executable tagged-template object.
// ---------------------------------------------------------------------------

export const loadFormatId = cache(
  async (formatName: string): Promise<FormatRow[]> =>
    await FORMAT_ID_SQL(formatName)
)

export const loadArchetypes = cache(
  async (formatId: string): Promise<ArchetypeRow[]> =>
    await ARCHETYPES_SQL(formatId)
)

export const loadKpi = cache(
  async (formatId: string, start: string, end: string): Promise<KpiRow[]> =>
    await KPI_SQL(formatId, start, end)
)

export const loadPlayerRecords = cache(
  async (formatId: string, start: string, end: string): Promise<PlayerRow[]> =>
    await PLAYER_RECORDS_SQL(formatId, start, end)
)

export const loadMatchups = cache(
  async (formatId: string, start: string, end: string): Promise<MatchupRow[]> =>
    await MATCHUPS_SQL(formatId, start, end)
)
