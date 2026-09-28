import { describe, expect, it } from 'vitest'
import {
  asIsoDate,
  buildArchetypeHrefs,
  parseMetaQuery,
  parseSort,
} from '@/lib/params'

const now = new Date('2026-09-15T12:00:00Z')

describe('parseSort', () => {
  it('maps legacy ?sort=tier to the presence default (record input)', () => {
    expect(parseSort({ sort: 'tier' })).toBe('presence')
  })

  it('maps legacy ?sort=tier to the presence default (URLSearchParams)', () => {
    expect(parseSort(new URLSearchParams('sort=tier'))).toBe('presence')
  })
})

describe('buildArchetypeHrefs', () => {
  const query = parseMetaQuery('modern', {}, now)
  const rows = [
    { slug: 'boros-energy', isBucket: false },
    { slug: 'unknown', isBucket: true },
    { slug: 'conflict', isBucket: true },
    { slug: 'amulet-titan', isBucket: false },
  ]

  it('links archetype rows to their detail page, preserving the lens', () => {
    expect(buildArchetypeHrefs('modern', query, rows, { now })).toEqual({
      'boros-energy': '/meta/modern/archetype/boros-energy',
      'amulet-titan': '/meta/modern/archetype/amulet-titan',
    })
    const custom = {
      ...query,
      start: asIsoDate('2026-08-01'),
      end: asIsoDate('2026-08-31'),
    }
    expect(
      buildArchetypeHrefs('modern', custom, rows, { now })['boros-energy']
    ).toBe(
      '/meta/modern/archetype/boros-energy?start=2026-08-01&end=2026-08-31'
    )
  })

  it('gives bucket rows (unknown/conflict) no href', () => {
    const hrefs = buildArchetypeHrefs('modern', query, rows, { now })
    expect(hrefs).not.toHaveProperty('unknown')
    expect(hrefs).not.toHaveProperty('conflict')
  })
})
