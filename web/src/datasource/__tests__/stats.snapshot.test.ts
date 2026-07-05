import { describe, expect, it } from 'vitest'
import {
  assignTiers,
  binomialCi,
  ciCrosses50,
  clusteredCi,
  lowN,
  presenceRank,
  reliability,
  tierForValue,
  wilsonCi,
  winrateCi,
  wr,
  wrExclDraws,
} from '@/lib/stats'
import { FixtureDataSource } from '@/datasource/fixtures'
import type {
  ArchetypeSlug,
  FormatSlug,
  IsoDate,
  MetaQuery,
} from '@/datasource/types'

// ---------------------------------------------------------------------------
// Guards the seeded fixtures + the shared math module (blueprint §8 risk 8):
// the fixture backend and the future Postgres backend both call @/lib/stats, so
// locking these values here catches any silent drift in CI/tier/rate math or in
// the committed fixture DB.
// ---------------------------------------------------------------------------

function stdQuery(overrides: Partial<MetaQuery> = {}): MetaQuery {
  return {
    format: 'standard' as FormatSlug,
    start: '2026-06-01' as IsoDate,
    end: '2026-06-30' as IsoDate,
    topN: 20,
    minMatches: 80,
    includeArchetypes: [],
    hideBuckets: true,
    weight: 'match',
    ...overrides,
  }
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4

describe('stats.ts — win rate', () => {
  it('canonical WR counts draws as half a win', () => {
    expect(wr(3, 1, 0)).toBe(0.75)
    expect(wr(1, 1, 2)).toBe(0.5) // (1 + 1) / 4
    expect(wr(0, 0, 0)).toBe(0)
  })

  it('marav WR excludes draws', () => {
    expect(wrExclDraws(3, 1)).toBe(0.75)
    expect(round4(wrExclDraws(2, 1))).toBe(0.6667)
    expect(wrExclDraws(0, 0)).toBe(0)
  })
})

describe('stats.ts — confidence intervals', () => {
  it('Wilson brackets the point estimate and stays in [0,1]', () => {
    const ci = wilsonCi(50, 100)
    expect(ci.lo).toBeGreaterThan(0.39)
    expect(ci.lo).toBeLessThan(0.5)
    expect(ci.hi).toBeGreaterThan(0.5)
    expect(ci.hi).toBeLessThan(0.61)
    expect(wilsonCi(0, 0)).toEqual({ lo: 0, hi: 1 })
  })

  it('Wald binomial clamps to the unit interval', () => {
    const ci = binomialCi(1, 1)
    expect(ci.lo).toBeGreaterThanOrEqual(0)
    expect(ci.hi).toBeLessThanOrEqual(1)
    expect(binomialCi(0, 0)).toEqual({ lo: 0, hi: 1 })
  })

  it('clustered CI is wider than Wilson for the same aggregate record', () => {
    // 100 games, 60 wins, but concentrated in a few streaky players.
    const clusters = [
      { wins: 20, losses: 0, draws: 0 },
      { wins: 20, losses: 0, draws: 0 },
      { wins: 20, losses: 0, draws: 0 },
      { wins: 0, losses: 20, draws: 0 },
      { wins: 0, losses: 20, draws: 0 },
    ]
    const clustered = clusteredCi(clusters)
    const wilson = wilsonCi(60, 100)
    expect(clustered.hi - clustered.lo).toBeGreaterThan(wilson.hi - wilson.lo)
  })

  it('dispatcher picks clustered → wilson → binomial by sample', () => {
    const many = Array.from({ length: 6 }, () => ({
      wins: 3,
      losses: 2,
      draws: 0,
    }))
    expect(winrateCi(many).method).toBe('clustered')
    expect(winrateCi([{ wins: 4, losses: 3, draws: 0 }]).method).toBe('wilson')
    expect(winrateCi([{ wins: 1, losses: 1, draws: 0 }]).method).toBe(
      'binomial'
    )
    expect(winrateCi([]).method).toBe('binomial')
  })
})

describe('stats.ts — tiers, ranks, matrix helpers', () => {
  it('tierForValue is monotonic and centered on the mean', () => {
    expect(tierForValue(0.5, 0.5, 0.1)).toBe(1.5)
    expect(tierForValue(0.8, 0.5, 0.1)).toBe(0)
    expect(tierForValue(0.2, 0.5, 0.1)).toBe(3)
    expect(tierForValue(0.5, 0.5, 0)).toBe(1.5) // degenerate sd
  })

  it('assignTiers excludes buckets from mean/σ and nulls them', () => {
    const tiers = assignTiers(
      [0.6, 0.5, 0.4, 0.99],
      [false, false, false, true]
    )
    expect(tiers[3]).toBeNull()
    expect(tiers[0]).not.toBeNull()
    expect(tiers[0] as number).toBeLessThanOrEqual(tiers[2] as number)
  })

  it('presenceRank is dense and ties share a rank', () => {
    expect(presenceRank([100, 50, 50, 10])).toEqual([1, 2, 2, 3])
  })

  it('matrix helpers', () => {
    expect(reliability(25)).toBe(0.5)
    expect(reliability(100)).toBe(1)
    expect(lowN(4)).toBe(true)
    expect(lowN(5)).toBe(false)
    expect(ciCrosses50(0.45, 0.55)).toBe(true)
    expect(ciCrosses50(0.51, 0.6)).toBe(false)
  })
})

describe('FixtureDataSource — Standard June 2026 mirrors the spike', () => {
  const ds = new FixtureDataSource()

  it('lists all seven formats', async () => {
    const formats = await ds.listFormats()
    expect(formats.map(f => f.slug).sort()).toEqual([
      'duel-commander',
      'legacy',
      'modern',
      'pauper',
      'pioneer',
      'standard',
      'vintage',
    ])
    expect(formats.find(f => f.slug === 'duel-commander')?.displayName).toBe(
      'DC'
    )
  })

  it('default view shows the 10 above-floor archetypes with spike numbers', async () => {
    const report = await ds.getMetaReport(stdQuery())
    expect(report.kpis).toEqual({
      tournaments: 58,
      entries: 1042,
      matches: 4277,
    })
    expect(report.rows).toHaveLength(10)
    const top = report.rows[0]
    expect(top.slug).toBe('selesnya-ouroboroid')
    expect(top.presenceRank).toBe(1)
    expect(top.matches).toBe(757)
    expect(round4(top.share)).toBe(round4(757 / 4277))
    expect(top.wr).toBeCloseTo(0.509, 2)
    expect(top.wins).toBe(385)
    expect(top.losses).toBe(372)
    expect(top.tier).not.toBeNull()
    expect(top.isBucket).toBe(false)
    // Buckets are hidden by default; the tail collapses into `other`.
    expect(report.rows.some(r => r.isBucket)).toBe(false)
    expect(report.other).not.toBeNull()
    expect(report.other!.matches).toBeGreaterThan(0)
  })

  it('minMatches floor hides exactly the four sub-80 archetypes', async () => {
    const report = await ds.getMetaReport(stdQuery())
    const slugs = report.rows.map(r => r.slug)
    expect(slugs).not.toContain('izzet-lessons')
    expect(slugs).not.toContain('izzet-aggro')
  })

  it('add= reveals a below-floor archetype', async () => {
    const report = await ds.getMetaReport(
      stdQuery({ includeArchetypes: ['izzet-aggro' as ArchetypeSlug] })
    )
    const aggro = report.rows.find(r => r.slug === 'izzet-aggro')
    expect(aggro).toBeDefined()
    expect(aggro!.matches).toBe(34)
    expect(aggro!.ciMethod).toBeDefined()
  })

  it('buckets=show surfaces the unknown/conflict rows', async () => {
    const report = await ds.getMetaReport(stdQuery({ hideBuckets: false }))
    const buckets = report.rows.filter(r => r.isBucket)
    expect(buckets.map(b => b.slug).sort()).toEqual(['conflict', 'unknown'])
    // Buckets never receive a tier.
    expect(buckets.every(b => b.tier === null)).toBe(true)
  })

  it('empty window drives an empty report', async () => {
    const report = await ds.getMetaReport(
      stdQuery({ start: '2026-08-01' as IsoDate, end: '2026-08-31' as IsoDate })
    )
    expect(report.rows).toHaveLength(0)
    expect(report.other).toBeNull()
  })

  it('matrix mirrors the spike top-10 records', async () => {
    const matrix = await ds.getMatchupMatrix({ ...stdQuery(), matrixTopN: 10 })
    expect(matrix.order).toHaveLength(10)
    expect(matrix.cells).toHaveLength(100)
    const cell = matrix.cells.find(
      c => c.rowSlug === 'selesnya-ouroboroid' && c.colSlug === 'izzet-prowess'
    )
    expect(cell).toBeDefined()
    expect(cell!.wins).toBe(74)
    expect(cell!.losses).toBe(69)
    expect(cell!.wr).toBeCloseTo(74 / 143, 4)
    const mirror = matrix.cells.find(
      c =>
        c.rowSlug === 'selesnya-ouroboroid' &&
        c.colSlug === 'selesnya-ouroboroid'
    )
    expect(mirror!.isMirror).toBe(true)
  })

  it('resolveSlug follows the renamed-archetype alias', async () => {
    const ref = await ds.resolveSlug(
      'standard' as FormatSlug,
      'selesnya-cub' as ArchetypeSlug
    )
    expect(ref?.slug).toBe('selesnya-ouroboroid')
  })

  it('archetype detail carries cards, matchups, and a trend gap', async () => {
    const detail = await ds.getArchetypeDetail({
      ...stdQuery(),
      slug: 'selesnya-landfall' as ArchetypeSlug,
    })
    expect(detail).not.toBeNull()
    expect(detail!.mainCards.length).toBeGreaterThan(0)
    expect(detail!.matchups.length).toBeGreaterThan(0)
    // gapWeek:true seeded a zero-game week → null WR point.
    expect(detail!.trends.some(t => t.wr === null)).toBe(true)
  })
})

describe('FixtureDataSource — derived report snapshot (drift guard)', () => {
  it('locks the Standard June derived rows', async () => {
    const ds = new FixtureDataSource()
    const report = await ds.getMetaReport(stdQuery())
    const shape = report.rows.map(r => ({
      slug: r.slug,
      rank: r.presenceRank,
      matches: r.matches,
      wr: round4(r.wr),
      wrLo: round4(r.wrLo),
      wrHi: round4(r.wrHi),
      ciMethod: r.ciMethod,
      tier: r.tier,
    }))
    expect(shape).toMatchSnapshot()
  })
})
