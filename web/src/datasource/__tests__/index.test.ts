import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ArchetypeSlug,
  FormatSlug,
  IsoDate,
  MetaQuery,
} from '@/datasource/types'

// ---------------------------------------------------------------------------
// Guards the DATA_SOURCE switch in `@/datasource` (index.ts). The regression
// this locks down: both backends are static imports of the barrel, so the
// Postgres module must not read env or open a pool at import time — fixtures
// mode has to load on a machine with no TOURNAMENT_DATABASE_URL at all.
// ---------------------------------------------------------------------------

// `unstable_cache` needs Next's incremental-cache store, which does not exist
// in a bare vitest node environment. The identity stub keeps the wrapper out
// of the DATA_SOURCE tests, but records the keyParts/options it was given so
// the decklists tests below can pin the cache keys.
/** unstable_cache's third argument (what the wrapper passes through). */
type UnstableCacheOptions = { revalidate?: number; tags?: string[] }
type CacheRecord = {
  keyParts?: string[]
  options?: UnstableCacheOptions
}
// The stub attaches its arguments to the wrapped fn: module-scope state would
// leak across the `vi.resetModules()` reloads these tests perform.
type RecordingFn<T extends (...args: never[]) => unknown> = T & {
  __cache?: CacheRecord
}

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(
    fn: T,
    keyParts?: string[],
    options?: UnstableCacheOptions
  ) => {
    const recording = fn as RecordingFn<T> // the stub's own artifact, not external data
    recording.__cache = { keyParts, options }
    return recording
  },
}))

/** The keyParts/options the unstable_cache stub recorded for one wrapper. */
function cacheOf<T extends (...args: never[]) => unknown>(fn: T): CacheRecord {
  const recording = fn as RecordingFn<T> // the stub's own artifact, not external data
  if (!recording.__cache) {
    throw new Error('method was never wrapped by the unstable_cache stub')
  }
  return recording.__cache
}

async function loadBarrel() {
  // Fresh module graph per case so the memoized singleton and the lazy
  // Postgres client both start from scratch under the stubbed env.
  vi.resetModules()
  return import('@/datasource')
}

describe('getDataSource() — DATA_SOURCE selection', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_SOURCE', undefined)
    vi.stubEnv('TOURNAMENT_DATABASE_URL', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to fixtures and loads with no TOURNAMENT_DATABASE_URL', async () => {
    const { getDataSource } = await loadBarrel()
    const formats = await getDataSource().listFormats()
    expect(Array.isArray(formats)).toBe(true)
    expect(formats.length).toBeGreaterThan(0)
  })

  it('rejects an unknown DATA_SOURCE loudly', async () => {
    vi.stubEnv('DATA_SOURCE', 'bogus')
    const { getDataSource } = await loadBarrel()
    expect(() => getDataSource()).toThrow(/Unknown DATA_SOURCE 'bogus'/)
  })

  it('fails loudly under DATA_SOURCE=postgres when the URL is unset', async () => {
    vi.stubEnv('DATA_SOURCE', 'postgres')
    const { getDataSource } = await loadBarrel()
    expect(() => getDataSource()).toThrow(/TOURNAMENT_DATABASE_URL is not set/)
  })
})

// ---------------------------------------------------------------------------
// Decklists cache wrappers (plan U3). The real PostgresDataSource is replaced
// by a recorder so what is under test is the WRAPPER: which arguments reach
// the inner source, and how each method was wrapped. The barrel is imported
// dynamically after `vi.resetModules()` — a static import would bind the
// memoized singleton from an earlier case instead of the one this test
// configures (same module-loading boundary the loadBarrel helper above
// exercises).
// ---------------------------------------------------------------------------

describe('withCache — decklists methods', () => {
  afterEach(() => {
    vi.doUnmock('@/datasource/postgres')
    vi.unstubAllEnvs()
  })

  it('exposes both methods, getDeck keyed on entry id only', async () => {
    vi.stubEnv('DATA_SOURCE', 'postgres')
    vi.stubEnv('TOURNAMENT_DATABASE_URL', 'postgresql://u:p@localhost/db')
    const calls: Array<{ method: string; arg: unknown }> = []
    vi.resetModules()
    vi.doMock('@/datasource/postgres', () => ({
      PostgresDataSource: class {
        getArchetypeEntries(q: unknown) {
          calls.push({ method: 'getArchetypeEntries', arg: q })
          return Promise.resolve({ total: 0, entries: [] })
        }
        getDeck(q: unknown) {
          calls.push({ method: 'getDeck', arg: q })
          return Promise.resolve(null)
        }
      },
    }))
    const { getDataSource } = await import('@/datasource')
    const ds = getDataSource()

    const q = {
      format: 'duel-commander' as FormatSlug,
      start: '2026-09-01' as IsoDate,
      end: '2026-09-30' as IsoDate,
      topN: 20,
      minMatches: 80,
      includeArchetypes: [],
      hideBuckets: false,
      weight: 'match' as const,
      slug: 'broodscale-combo' as ArchetypeSlug,
    } as MetaQuery & { slug: ArchetypeSlug }
    const entries = await ds.getArchetypeEntries(q)
    const deck = await ds.getDeck({
      format: 'duel-commander' as FormatSlug,
      entryId: 'abc-uuid',
    })

    expect(entries).toEqual({ total: 0, entries: [] })
    expect(deck).toBeNull()
    expect(calls).toEqual([
      // The entries read forwards the full window query (keyed on the
      // window like the other archetype reads)...
      { method: 'getArchetypeEntries', arg: q },
      // ...while getDeck forwards the ENTRY ID ONLY — no format, no window
      // (KTD7: one cache entry per deck, shared by archetype + tournament
      // pages).
      { method: 'getDeck', arg: { entryId: 'abc-uuid' } },
    ])
  })

  it('wraps both methods under the archetype tag', async () => {
    vi.stubEnv('DATA_SOURCE', 'postgres')
    vi.stubEnv('TOURNAMENT_DATABASE_URL', 'postgresql://u:p@localhost/db')
    vi.resetModules()
    vi.doMock('@/datasource/postgres', () => ({
      PostgresDataSource: class {},
    }))
    const { getDataSource } = await import('@/datasource')
    const ds = getDataSource()

    for (const method of ['getArchetypeEntries', 'getDeck'] as const) {
      const { keyParts, options } = cacheOf(ds[method])
      expect(keyParts, method).toEqual([method])
      expect(options?.tags, method).toEqual(['archetype'])
    }
  })
})
