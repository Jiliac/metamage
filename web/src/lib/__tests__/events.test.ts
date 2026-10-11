import { describe, expect, it } from 'vitest'

import type {
  ArchetypeSlug,
  EventMatchupDTO,
  StandingDTO,
} from '@/datasource/types'
import {
  deckHref,
  leaderLabel,
  standingLink,
  eventStats,
  isEventId,
  placingLabel,
  recordLabel,
  rankStandings,
  isPartialRecordSource,
  sortStandings,
} from '@/lib/events'
import { asIsoDate, parseMetaQuery } from '@/lib/params'

const now = new Date('2026-10-11T12:00:00Z')
const slug = (s: string) => s as ArchetypeSlug
const day = asIsoDate('2026-10-03')

function standing(
  over: Partial<StandingDTO> & { arch?: string; bucket?: boolean } = {}
): StandingDTO {
  const arch = over.arch ?? 'broodscale'
  return {
    entryId: over.entryId ?? `e-${Math.random()}`,
    rank: over.rank ?? null,
    wins: over.wins ?? 0,
    losses: over.losses ?? 0,
    draws: over.draws ?? 0,
    player: over.player ?? 'p',
    archetype: over.archetype ?? {
      slug: slug(arch),
      name: arch,
      color: null,
      isBucket: over.bucket ?? false,
    },
    ...(over.decklistUrl ? { decklistUrl: over.decklistUrl } : {}),
    hasDecklist: over.hasDecklist ?? true,
  }
}

function mu(
  row: string,
  col: string,
  wins: number,
  losses: number,
  draws = 0
): EventMatchupDTO {
  return { rowSlug: slug(row), colSlug: slug(col), wins, losses, draws }
}

describe('isEventId', () => {
  it('accepts UUIDs and fixture ids', () => {
    expect(isEventId('955b224c-23eb-49b1-94d3-4c6975a4f959')).toBe(true)
    expect(isEventId('2026-05-01-mtgo-17')).toBe(true)
  })

  it('rejects traversal, empty and over-long input', () => {
    expect(isEventId('../x')).toBe(false)
    expect(isEventId('')).toBe(false)
    expect(isEventId('a'.repeat(65))).toBe(false)
    expect(isEventId('-leading')).toBe(false)
  })
})

describe('sortStandings', () => {
  it('orders published placings first, by rank', () => {
    const out = sortStandings([
      standing({ entryId: 'c', rank: 3 }),
      standing({ entryId: 'x', rank: null, wins: 9 }),
      standing({ entryId: 'a', rank: 1 }),
    ])
    expect(out.map(s => s.entryId)).toEqual(['a', 'c', 'x'])
  })

  it('breaks equal ranks by player', () => {
    const out = sortStandings([
      standing({ entryId: 'b', rank: 2, player: 'zed' }),
      standing({ entryId: 'a', rank: 2, player: 'amy' }),
    ])
    expect(out.map(s => s.entryId)).toEqual(['a', 'b'])
  })

  it('orders unranked entries by match points, then losses, then player', () => {
    const out = sortStandings([
      standing({ entryId: 'b', wins: 2, losses: 2, player: 'b' }),
      standing({ entryId: 'a', wins: 3, losses: 0, player: 'z' }),
      standing({ entryId: 'd', wins: 2, losses: 0, draws: 0, player: 'd' }),
      standing({ entryId: 'c', wins: 2, losses: 2, player: 'a' }),
    ])
    expect(out.map(s => s.entryId)).toEqual(['a', 'd', 'c', 'b'])
  })

  it('does not mutate its input', () => {
    const input = [standing({ rank: 2 }), standing({ rank: 1 })]
    const copy = [...input]
    sortStandings(input)
    expect(input).toEqual(copy)
  })
})

describe('labels', () => {
  it('renders ordinal placings', () => {
    expect(placingLabel(1)).toBe('1st')
    expect(placingLabel(2)).toBe('2nd')
    expect(placingLabel(3)).toBe('3rd')
    expect(placingLabel(4)).toBe('4th')
    expect(placingLabel(11)).toBe('11th')
    expect(placingLabel(12)).toBe('12th')
    expect(placingLabel(13)).toBe('13th')
    expect(placingLabel(21)).toBe('21st')
    expect(placingLabel(null)).toBeNull()
  })

  it('shows draws only when there are any', () => {
    expect(recordLabel(standing({ wins: 5, losses: 1 }))).toBe('5-1')
    expect(recordLabel(standing({ wins: 4, losses: 1, draws: 1 }))).toBe(
      '4-1-1'
    )
  })
})

describe('eventStats', () => {
  const standings = [
    standing({ arch: 'broodscale' }),
    standing({ arch: 'broodscale' }),
    standing({ arch: 'broodscale' }),
    standing({ arch: 'prowess' }),
    standing({ arch: 'prowess' }),
    standing({ arch: 'murktide' }),
    standing({ arch: 'unknown', bucket: true }),
    standing({ arch: 'unknown', bucket: true }),
  ]
  const matchups = [
    mu('broodscale', 'prowess', 3, 1),
    mu('prowess', 'broodscale', 1, 3),
    mu('broodscale', 'broodscale', 1, 1),
    mu('prowess', 'murktide', 0, 2),
    mu('murktide', 'prowess', 2, 0),
    mu('broodscale', 'unknown', 2, 0),
    mu('unknown', 'broodscale', 0, 2),
  ]

  it('builds the field by deck count, buckets last', () => {
    const { field } = eventStats(standings, matchups, day)
    expect(field.map(f => [f.slug, f.decks])).toEqual([
      ['broodscale', 3],
      ['prowess', 2],
      ['murktide', 1],
      ['unknown', 2],
    ])
    expect(field[0].share).toBeCloseTo(3 / 8)
    expect(field.map(f => f.presenceRank)).toEqual([1, 2, 3, 4])
  })

  it('builds a matrix over non-bucket archetypes with games', () => {
    const { matrix } = eventStats(standings, matchups, day)
    expect(matrix.order.map(o => o.slug)).toEqual([
      'broodscale',
      'prowess',
      'murktide',
    ])
    // broodscale: 3-1 vs prowess, 1-1 mirror, 2-0 vs unknown → 6-2
    expect(matrix.order[0].globalWr).toBeCloseTo(6 / 8)
    expect(matrix.cells).toHaveLength(9)
    const bp = matrix.cells.find(
      c => c.rowSlug === 'broodscale' && c.colSlug === 'prowess'
    )!
    expect([bp.wins, bp.losses]).toEqual([3, 1])
    // Event scope: any played pair is readable (window blanks under 5 games).
    expect(bp.lowN).toBe(false)
    const pm = matrix.cells.find(
      c => c.rowSlug === 'prowess' && c.colSlug === 'murktide'
    )!
    expect([pm.wins, pm.losses]).toEqual([0, 2])
    const mirror = matrix.cells.find(
      c => c.rowSlug === 'broodscale' && c.colSlug === 'broodscale'
    )!
    expect(mirror.isMirror).toBe(true)
    expect(mirror.games).toBe(0)
    const unplayed = matrix.cells.find(
      c => c.rowSlug === 'broodscale' && c.colSlug === 'murktide'
    )!
    expect(unplayed.lowN).toBe(true)
  })

  it('caps the matrix at topN by deck count', () => {
    const { matrix } = eventStats(standings, matchups, day, { matrixTopN: 2 })
    expect(matrix.order.map(o => o.slug)).toEqual(['broodscale', 'prowess'])
    expect(matrix.cells).toHaveLength(4)
  })

  it('drops archetypes without games from the matrix but keeps them in the field', () => {
    const { field, matrix } = eventStats(
      [...standings, standing({ arch: 'tron' })],
      matchups,
      day
    )
    expect(field.some(f => f.slug === 'tron')).toBe(true)
    expect(matrix.order.some(o => o.slug === 'tron')).toBe(false)
  })

  it('handles an empty event', () => {
    const { field, matrix } = eventStats([], [], day)
    expect(field).toEqual([])
    expect(matrix.order).toEqual([])
    expect(matrix.cells).toEqual([])
  })
})

describe('deckHref', () => {
  const query = parseMetaQuery('modern', {}, now)

  it('links to the archetype decklist, keeping a window that holds the event', () => {
    expect(
      deckHref(
        'modern',
        query,
        standing({ entryId: 'abc', arch: 'broodscale' }),
        asIsoDate('2026-10-03'),
        now
      )
    ).toBe('/meta/modern/archetype/broodscale?deck=abc')
  })

  it('moves the window to end on the event when the lens does not hold it', () => {
    expect(
      deckHref(
        'modern',
        query,
        standing({ entryId: 'abc', arch: 'broodscale' }),
        asIsoDate('2026-06-15'),
        now
      )
    ).toBe(
      '/meta/modern/archetype/broodscale?start=2026-05-17&end=2026-06-15&deck=abc'
    )
  })

  it('returns null for bucket archetypes (no detail page)', () => {
    expect(
      deckHref(
        'modern',
        query,
        standing({ arch: 'unknown', bucket: true }),
        asIsoDate('2026-10-03'),
        now
      )
    ).toBeNull()
  })
})

describe('leaderLabel', () => {
  it('names the winner, a top finisher without a 1st, or the best record', () => {
    expect(leaderLabel(1)).toBe('Winner')
    expect(leaderLabel(2)).toBe('Top finisher')
    expect(leaderLabel(null)).toBe('Best record')
  })
})

describe('standingLink', () => {
  const query = parseMetaQuery('modern', {}, now)
  const day = asIsoDate('2026-10-03')
  const SRC = 'https://melee.gg/Decklist/View/1'

  it('opens the stored decklist on the archetype page', () => {
    expect(
      standingLink('modern', query, standing({ entryId: 'abc' }), day, now)
    ).toEqual({
      href: '/meta/modern/archetype/broodscale?deck=abc',
      external: false,
    })
  })

  it("falls back to the source's list when no cards are stored", () => {
    expect(
      standingLink(
        'modern',
        query,
        standing({ hasDecklist: false, decklistUrl: SRC }),
        day,
        now
      )
    ).toEqual({ href: SRC, external: true })
  })

  it("uses the source's list for buckets (no archetype page)", () => {
    expect(
      standingLink(
        'modern',
        query,
        standing({ arch: 'unknown', bucket: true, decklistUrl: SRC }),
        day,
        now
      )
    ).toEqual({ href: SRC, external: true })
  })

  it('is null with neither a stored nor a published list', () => {
    expect(
      standingLink('modern', query, standing({ hasDecklist: false }), day, now)
    ).toBeNull()
  })
})

describe('rankStandings', () => {
  it('keeps published placings as they are', () => {
    const out = rankStandings([
      standing({ entryId: 'b', rank: 2 }),
      standing({ entryId: 'a', rank: 1 }),
    ])
    expect(out.map(r => [r.standing.entryId, r.place, r.derived])).toEqual([
      ['a', 1, false],
      ['b', 2, false],
    ])
  })

  it('derives competition ranks from match points when none are published', () => {
    const out = rankStandings([
      standing({ entryId: 'c', wins: 4, losses: 1, player: 'c' }),
      standing({ entryId: 'a', wins: 5, losses: 0, player: 'a' }),
      standing({ entryId: 'd', wins: 4, losses: 1, player: 'd' }),
      standing({ entryId: 'e', wins: 4, losses: 2, player: 'e' }),
      standing({ entryId: 'f', wins: 3, losses: 1, draws: 1, player: 'f' }),
    ])
    expect(out.map(r => [r.standing.entryId, r.place, r.derived])).toEqual([
      ['a', 1, true],
      ['c', 2, true],
      ['d', 2, true],
      ['e', 4, true],
      ['f', 5, true],
    ])
  })

  it('numbers unranked entries after the published ones', () => {
    const out = rankStandings([
      standing({ entryId: 'x', wins: 9 }),
      standing({ entryId: 'a', rank: 1 }),
      standing({ entryId: 'b', rank: 2 }),
    ])
    expect(out.map(r => [r.standing.entryId, r.place, r.derived])).toEqual([
      ['a', 1, false],
      ['b', 2, false],
      ['x', 3, true],
    ])
  })

  it('returns a new array and leaves the input untouched', () => {
    const input = [standing({ entryId: 'b', rank: 2 }), standing({ rank: 1 })]
    const copy = [...input]
    rankStandings(input)
    expect(input).toEqual(copy)
  })
})

describe('isPartialRecordSource', () => {
  it('flags only MTGO, whose records skip unpublished decks', () => {
    expect(isPartialRecordSource('MTGO')).toBe(true)
    expect(isPartialRecordSource('MELEE')).toBe(false)
    expect(isPartialRecordSource('CARDSREALM')).toBe(false)
  })
})
