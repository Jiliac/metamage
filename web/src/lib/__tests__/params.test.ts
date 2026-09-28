import { describe, expect, it } from 'vitest'

import type { MatrixOrderEntryDTO } from '@/datasource/types'
import {
  asArchetypeSlug,
  buildHref,
  parseMatrixTopN,
  parseMetaQuery,
  parseRow,
} from '@/lib/params'

// ---------------------------------------------------------------------------
// KTD8: URL-serialization round-trips only. `?row` (the mobile matchup list's
// selected archetype, KTD4) must mirror `?n`'s contract — resolve against the
// caller-supplied matrix order, fall back to presence rank 1, and vanish from
// the canonical URL at the rank-1 default — without ever entering `MetaQuery`.
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-15T12:00:00Z')

const ORDER: MatrixOrderEntryDTO[] = [
  {
    slug: asArchetypeSlug('mono-blue-faeries'),
    name: 'Mono Blue Faeries',
    color: '#3b82f6',
    globalWr: 0.54,
    share: 0.11,
    matches: 640,
    presenceRank: 1,
  },
  {
    slug: asArchetypeSlug('boros-dwarves'),
    name: 'Boros Dwarves',
    color: '#ef4444',
    globalWr: 0.51,
    share: 0.08,
    matches: 480,
    presenceRank: 2,
  },
  {
    slug: asArchetypeSlug('dimir-control'),
    name: 'Dimir Control',
    color: '#8b5cf6',
    globalWr: 0.49,
    share: 0.06,
    matches: 320,
    presenceRank: 3,
  },
]

const SP = (qs: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(qs))

const fmtHref = (opts: Parameters<typeof buildHref>[2]) =>
  buildHref('pauper', parseMetaQuery('pauper', {}, NOW), {
    matrixOrder: ORDER,
    now: NOW,
    ...opts,
  })

describe('parseRow', () => {
  it('resolves a known slug against the order', () => {
    expect(parseRow(SP('row=boros-dwarves'), ORDER)).toBe('boros-dwarves')
  })

  it('falls back to presence rank 1 when absent', () => {
    expect(parseRow(SP(''), ORDER)).toBe('mono-blue-faeries')
  })

  it('falls back to presence rank 1 for an unknown slug', () => {
    expect(parseRow(SP('row=goblin-bikeshed'), ORDER)).toBe('mono-blue-faeries')
  })

  it('falls back to presence rank 1 for a non-slug string', () => {
    expect(parseRow(SP('row=Not A Slug!!'), ORDER)).toBe('mono-blue-faeries')
    expect(parseRow(SP('row=-leading-hyphen'), ORDER)).toBe('mono-blue-faeries')
  })

  it('falls back to presence rank 1 for a slug outside the current order', () => {
    // Valid slug shape, real archetype elsewhere in the metagame — but the
    // current matrix order does not include it.
    expect(parseRow(SP('row=grixis-affinity'), ORDER)).toBe('mono-blue-faeries')
  })

  it('returns undefined for an empty order instead of throwing', () => {
    expect(parseRow(SP('row=boros-dwarves'), [])).toBeUndefined()
    expect(parseRow(SP(''), [])).toBeUndefined()
  })

  it('returns undefined (no value) without an order', () => {
    expect(parseRow(SP(''))).toBeUndefined()
    // A well-formed raw slug round-trips verbatim so lens knobs keep it.
    expect(parseRow(SP('row=boros-dwarves'))).toBe('boros-dwarves')
    expect(parseRow(SP('row=@@bad'))).toBeUndefined()
  })

  it('never leaks into parseMetaQuery output', () => {
    const withRow = parseMetaQuery('pauper', SP('row=boros-dwarves&n=20'), NOW)
    const withoutRow = parseMetaQuery('pauper', SP('n=20'), NOW)
    expect(withRow).toEqual(withoutRow)
  })
})

describe('buildHref row round-trip (KTD4)', () => {
  it('byte-identical round-trip alongside existing params + ?n', () => {
    const sp = SP(
      'start=2026-05-01&end=2026-05-31&top=30&min=20&weight=entry' +
        '&buckets=show&add=grixis-affinity,izzet-blitz&n=20&row=boros-dwarves'
    )
    const query = parseMetaQuery('pauper', sp, NOW)
    const href = buildHref('pauper', query, {
      path: '/matrix',
      matrixTopN: parseMatrixTopN(sp),
      row: parseRow(sp, ORDER),
      matrixOrder: ORDER,
      now: NOW,
    })
    expect(href).toBe(
      '/meta/pauper/matrix?start=2026-05-01&end=2026-05-31&top=30&min=20' +
        '&weight=entry&buckets=show&add=grixis-affinity%2Cizzet-blitz&n=20' +
        '&row=boros-dwarves'
    )
    // And it parses back to the same selection through the canonical path.
    const qs = href.split('?')[1] ?? ''
    expect(parseRow(SP(qs), ORDER)).toBe('boros-dwarves')
    expect(parseMetaQuery('pauper', SP(qs), NOW)).toEqual(query)
  })

  it('omits row equal to the rank-1 slug', () => {
    expect(fmtHref({ row: asArchetypeSlug('mono-blue-faeries') })).toBe(
      '/meta/pauper'
    )
  })

  it('omits row when absent and re-derives rank 1 on parse', () => {
    const href = fmtHref({})
    expect(href).toBe('/meta/pauper')
    expect(parseRow(SP(''), ORDER)).toBe('mono-blue-faeries')
  })

  it('emits an unknown row as-is (canonical parse then falls back)', () => {
    // The LensBar round-trips a raw `?row` without an order; the matrix
    // surface re-canonicalizes it.
    expect(parseRow(SP('row=boros-dwarves'))).toBe('boros-dwarves')
  })

  it('keeps row on a same-surface knob patch via the setParams path', () => {
    // buildHref is the serialization choke point useMetaParams uses; verify
    // that a knob-only write (matrixTopN) preserves a non-default row.
    const sp = SP('row=dimir-control&n=12')
    const query = parseMetaQuery('pauper', sp, NOW)
    const href = buildHref('pauper', query, {
      path: '/matrix',
      matrixTopN: 20,
      row: parseRow(sp, ORDER),
      matrixOrder: ORDER,
      now: NOW,
    })
    expect(href).toBe('/meta/pauper/matrix?n=20&row=dimir-control')
  })
})
