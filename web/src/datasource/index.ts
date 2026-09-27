import { unstable_cache } from 'next/cache'

import type {
  ArchetypeDetailDTO,
  ArchetypeRef,
  ArchetypeSlug,
  CardAdoptionDTO,
  FormatDTO,
  FormatSlug,
  IsoDate,
  MatchupCellDTO,
  MatrixDTO,
  MetaChangeDTO,
  MetaDataSource,
  MetaQuery,
  MetaReportDTO,
  SourceDTO,
  TournamentDTO,
  TrendPointDTO,
} from '@/datasource/types'
import { FixtureDataSource } from '@/datasource/fixtures'
import { PostgresDataSource } from '@/datasource/postgres'

// ---------------------------------------------------------------------------
// getDataSource() — the single choke point every page/route imports (blueprint
// §3). The backend is chosen once by the `DATA_SOURCE` env var (`fixtures`,
// the default, serves the committed fixture DB; `postgres` is the live Neon
// read path; any other value is a hard error) and memoized as a module
// singleton. Pages must NEVER import a concrete source or a DB client.
//
// Both backends are imported statically so the switch below can pick one, so
// neither module may do work at import time — the Postgres client is created
// lazily inside `PostgresDataSource` (see postgres/client.ts).
//
// WP7: every read is wrapped in `unstable_cache`, keyed on the method name plus
// the serialized `MetaQuery` (unstable_cache folds the call arguments into the
// cache key automatically). This gives the combinatorial long-tail of windows +
// knobs an ISR-style memo per §6/§8-risk-1 without any page-level change, and it
// is where the Postgres backend gets its query cache for free. Revalidate
// horizons mirror the §2 route table: report/matrix/tournaments hourly, the
// format-level metadata (formats list, bans/releases) daily.
// ---------------------------------------------------------------------------

export type DataSourceKind = 'fixtures' | 'postgres'

const HOUR = 3600
const DAY = 86_400

function createRawDataSource(): MetaDataSource {
  const kind = process.env.DATA_SOURCE ?? 'fixtures'
  switch (kind) {
    case 'postgres':
      // The live-data read path. The constructor throws if
      // TOURNAMENT_DATABASE_URL is unset — a loud configuration failure is the
      // designed behavior (serving fixtures under DATA_SOURCE=postgres would
      // be a silent data-integrity failure).
      return new PostgresDataSource()
    case 'fixtures':
      return new FixtureDataSource()
    default:
      throw new Error(
        `[datasource] Unknown DATA_SOURCE '${kind}' — expected 'fixtures' or 'postgres'.`
      )
  }
}

/**
 * Wrap a raw `MetaDataSource` so every method result is memoized by
 * `unstable_cache`. The cache key is `[method]` (the `keyParts`) plus a stable
 * serialization of the call arguments — so two identical `MetaQuery` lenses hit
 * the same cache entry (deep-link ⇒ ISR cache key parity, blueprint §2). All
 * DTOs are plain JSON, so they round-trip through the data cache cleanly.
 */
function withCache(inner: MetaDataSource): MetaDataSource {
  return {
    listFormats: unstable_cache(
      (): Promise<FormatDTO[]> => inner.listFormats(),
      ['listFormats'],
      { revalidate: DAY, tags: ['formats'] }
    ),

    getLatestWindow: unstable_cache(
      (format: FormatSlug): Promise<{ start: IsoDate; end: IsoDate } | null> =>
        inner.getLatestWindow(format),
      ['getLatestWindow'],
      { revalidate: HOUR, tags: ['meta-report'] }
    ),

    getMetaReport: unstable_cache(
      (q: MetaQuery): Promise<MetaReportDTO> => inner.getMetaReport(q),
      ['getMetaReport'],
      { revalidate: HOUR, tags: ['meta-report'] }
    ),

    getArchetypeDetail: unstable_cache(
      (
        q: MetaQuery & { slug: ArchetypeSlug }
      ): Promise<ArchetypeDetailDTO | null> => inner.getArchetypeDetail(q),
      ['getArchetypeDetail'],
      { revalidate: HOUR, tags: ['archetype'] }
    ),

    getArchetypeCards: unstable_cache(
      (
        q: MetaQuery & { slug: ArchetypeSlug; board: 'MAIN' | 'SIDE' }
      ): Promise<CardAdoptionDTO[]> => inner.getArchetypeCards(q),
      ['getArchetypeCards'],
      { revalidate: HOUR, tags: ['archetype'] }
    ),

    getArchetypeTrends: unstable_cache(
      (q: MetaQuery & { slug: ArchetypeSlug }): Promise<TrendPointDTO[]> =>
        inner.getArchetypeTrends(q),
      ['getArchetypeTrends'],
      { revalidate: HOUR, tags: ['archetype'] }
    ),

    getMatchupMatrix: unstable_cache(
      (q: MetaQuery & { matrixTopN: number }): Promise<MatrixDTO> =>
        inner.getMatchupMatrix(q),
      ['getMatchupMatrix'],
      { revalidate: HOUR, tags: ['matrix'] }
    ),

    getMatchup: unstable_cache(
      (
        q: MetaQuery & { a: ArchetypeSlug; b: ArchetypeSlug }
      ): Promise<MatchupCellDTO | null> => inner.getMatchup(q),
      ['getMatchup'],
      { revalidate: HOUR, tags: ['matrix'] }
    ),

    getFormatMetaChanges: unstable_cache(
      (format: FormatSlug): Promise<MetaChangeDTO[]> =>
        inner.getFormatMetaChanges(format),
      ['getFormatMetaChanges'],
      { revalidate: DAY, tags: ['changes'] }
    ),

    getTournaments: unstable_cache(
      (q: MetaQuery): Promise<TournamentDTO[]> => inner.getTournaments(q),
      ['getTournaments'],
      { revalidate: HOUR, tags: ['tournaments'] }
    ),

    getSources: unstable_cache(
      (q: MetaQuery): Promise<SourceDTO[]> => inner.getSources(q),
      ['getSources'],
      { revalidate: HOUR, tags: ['tournaments'] }
    ),

    searchArchetypes: unstable_cache(
      (format: FormatSlug, query: string): Promise<ArchetypeRef[]> =>
        inner.searchArchetypes(format, query),
      ['searchArchetypes'],
      { revalidate: DAY, tags: ['archetype-list'] }
    ),

    resolveSlug: unstable_cache(
      (format: FormatSlug, slug: ArchetypeSlug): Promise<ArchetypeRef | null> =>
        inner.resolveSlug(format, slug),
      ['resolveSlug'],
      { revalidate: DAY, tags: ['archetype-list'] }
    ),
  }
}

let singleton: MetaDataSource | null = null

/** The process-wide, cache-wrapped data source singleton. */
export function getDataSource(): MetaDataSource {
  if (singleton === null) singleton = withCache(createRawDataSource())
  return singleton
}
