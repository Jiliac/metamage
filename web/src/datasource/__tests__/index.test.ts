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
// in a bare vitest node environment. The stub emulates the two semantics the
// wrapper relies on — the call arguments are the key (JSON-serialized, like
// Next's invocation key) and only resolved results are stored, a throw
// stores nothing — and records the keyParts/options it was given so the
// decklists tests below can pin the cache keys.
/** unstable_cache's third argument (what the wrapper passes through). */
type UnstableCacheOptions = { revalidate?: number; tags?: string[] }
type CacheRecord = {
  keyParts?: string[]
  options?: UnstableCacheOptions
}
// Keyed by keyParts[0] (the method name). Cleared per decklists case; each
// getDataSource() after `vi.resetModules()` re-registers its wrappers.
const cacheRecords = vi.hoisted(() => new Map<string, CacheRecord>())

vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(
    fn: (...args: A) => Promise<R>,
    keyParts?: string[],
    options?: UnstableCacheOptions
  ) => {
    cacheRecords.set(keyParts?.[0] ?? '', { keyParts, options })
    const store = new Map<string, R>()
    return async (...args: A): Promise<R> => {
      const key = JSON.stringify(args)
      if (store.has(key)) return store.get(key) as R
      const result = await fn(...args) // a throw propagates, nothing stored
      store.set(key, result)
      return result
    }
  },
}))

/** The keyParts/options the unstable_cache stub recorded for one method. */
function cacheOf(method: string): CacheRecord {
  const record = cacheRecords.get(method)
  if (!record) throw new Error(`${method} was never wrapped by unstable_cache`)
  return record
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
  beforeEach(() => {
    cacheRecords.clear()
  })

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
    getDataSource() // registers the wrappers

    for (const method of ['getArchetypeEntries', 'getDeck'] as const) {
      const { keyParts, options } = cacheOf(method)
      expect(keyParts, method).toEqual([method])
      expect(options?.tags, method).toEqual(['archetype'])
    }
  })

  it('caches a found deck once per entry id, whatever the format', async () => {
    vi.stubEnv('DATA_SOURCE', 'postgres')
    vi.stubEnv('TOURNAMENT_DATABASE_URL', 'postgresql://u:p@localhost/db')
    const found = { entry: { id: 'abc-uuid' } }
    let reads = 0
    vi.resetModules()
    vi.doMock('@/datasource/postgres', () => ({
      PostgresDataSource: class {
        getDeck() {
          reads++
          return Promise.resolve(found)
        }
      },
    }))
    const { getDataSource } = await import('@/datasource')
    const ds = getDataSource()

    const a = await ds.getDeck({
      format: 'duel-commander' as FormatSlug,
      entryId: 'abc-uuid',
    })
    const b = await ds.getDeck({
      format: 'modern' as FormatSlug,
      entryId: 'abc-uuid',
    })
    const c = await ds.getDeck({ entryId: 'abc-uuid' })

    expect([a, b, c]).toEqual([found, found, found])
    // `format` is not part of the key: one inner read serves all three.
    expect(reads).toBe(1)
  })

  it('never caches a miss, so unknown ids cannot grow the cache', async () => {
    vi.stubEnv('DATA_SOURCE', 'postgres')
    vi.stubEnv('TOURNAMENT_DATABASE_URL', 'postgresql://u:p@localhost/db')
    let reads = 0
    vi.resetModules()
    vi.doMock('@/datasource/postgres', () => ({
      PostgresDataSource: class {
        getDeck() {
          reads++
          return Promise.resolve(null)
        }
      },
    }))
    const { getDataSource } = await import('@/datasource')
    const ds = getDataSource()

    const id = '00000000-0000-4000-8000-000000000000'
    expect(await ds.getDeck({ entryId: id })).toBeNull()
    expect(await ds.getDeck({ entryId: id })).toBeNull()
    // Both calls reached the inner source: the miss was thrown inside the
    // cached function (stored nothing) and mapped back to null outside it.
    expect(reads).toBe(2)
  })

  it('propagates real inner errors instead of mapping them to null', async () => {
    vi.stubEnv('DATA_SOURCE', 'postgres')
    vi.stubEnv('TOURNAMENT_DATABASE_URL', 'postgresql://u:p@localhost/db')
    vi.resetModules()
    vi.doMock('@/datasource/postgres', () => ({
      PostgresDataSource: class {
        getDeck() {
          return Promise.reject(new Error('connection refused'))
        }
      },
    }))
    const { getDataSource } = await import('@/datasource')

    await expect(
      getDataSource().getDeck({ entryId: 'abc-uuid' })
    ).rejects.toThrow('connection refused')
  })
})

// ---------------------------------------------------------------------------
// getTournament wrapper: keyed on the event id, a hit cached once, a miss
// never cached (same throw-inside scheme as getDeck).
// ---------------------------------------------------------------------------

describe('withCache — getTournament', () => {
  beforeEach(() => {
    cacheRecords.clear()
    vi.stubEnv('DATA_SOURCE', 'postgres')
    vi.stubEnv('TOURNAMENT_DATABASE_URL', 'postgresql://u:p@localhost/db')
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('@/datasource/postgres')
    vi.unstubAllEnvs()
  })

  async function withInner(getTournament: (id: string) => Promise<unknown>) {
    vi.doMock('@/datasource/postgres', () => ({
      PostgresDataSource: class {
        getTournament = getTournament
      },
    }))
    const { getDataSource } = await import('@/datasource')
    return getDataSource()
  }

  it('wraps it under the tournaments tag, keyed on the method', async () => {
    await withInner(() => Promise.resolve(null))
    const { keyParts, options } = cacheOf('getTournament')
    expect(keyParts).toEqual(['getTournament'])
    expect(options?.tags).toEqual(['tournaments'])
  })

  it('caches a found event once per id', async () => {
    const found = { tournament: { id: 'evt' }, standings: [], matchups: [] }
    let reads = 0
    const ds = await withInner(() => {
      reads++
      return Promise.resolve(found)
    })
    expect(await ds.getTournament('evt')).toEqual(found)
    expect(await ds.getTournament('evt')).toEqual(found)
    expect(reads).toBe(1)
  })

  it('never caches a miss, so unknown ids cannot grow the cache', async () => {
    let reads = 0
    const ds = await withInner(() => {
      reads++
      return Promise.resolve(null)
    })
    expect(await ds.getTournament('not-an-event')).toBeNull()
    expect(await ds.getTournament('not-an-event')).toBeNull()
    expect(reads).toBe(2)
  })

  it('propagates real inner errors instead of mapping them to null', async () => {
    const ds = await withInner(() =>
      Promise.reject(new Error('connection refused'))
    )
    await expect(ds.getTournament('evt')).rejects.toThrow('connection refused')
  })
})
