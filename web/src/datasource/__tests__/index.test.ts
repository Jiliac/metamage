import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Guards the DATA_SOURCE switch in `@/datasource` (index.ts). The regression
// this locks down: both backends are static imports of the barrel, so the
// Postgres module must not read env or open a pool at import time — fixtures
// mode has to load on a machine with no TOURNAMENT_DATABASE_URL at all.
// ---------------------------------------------------------------------------

// `unstable_cache` needs Next's incremental-cache store, which does not exist
// in a bare vitest node environment; the wrapper is not what is under test.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

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
