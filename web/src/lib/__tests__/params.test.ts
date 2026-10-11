import { describe, expect, it } from 'vitest'

import type { MatrixOrderEntryDTO } from '@/datasource/types'
import { MAX_DECKS_PAGE } from '@/lib/decks'
import {
  asArchetypeSlug,
  buildHref,
  parseDeckId,
  parseDecksPage,
  parseMatrixTopN,
  parseMetaQuery,
  parsePage,
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

// ---------------------------------------------------------------------------
// KTD6/KTD8: the Decklists tab's route extras. `?deck` validates before any
// data call; `?decks` pages the recent-decks column; both ride the fixed
// buildHref order after `tab` and stay out of `MetaQuery`.
// ---------------------------------------------------------------------------

const DECK_ID = '3f2b8c1a-9d4e-4c7b-a1f2-0b6d5e8a9c10'

describe('parseDeckId (KTD6)', () => {
  it('accepts a well-formed UUID and normalizes case', () => {
    expect(parseDeckId(DECK_ID)).toBe(DECK_ID)
    expect(parseDeckId(DECK_ID.toUpperCase())).toBe(DECK_ID)
  })

  it('rejects path traversal, empty, junk and over-length input', () => {
    expect(parseDeckId('../x')).toBeUndefined()
    expect(parseDeckId('')).toBeUndefined()
    expect(parseDeckId(undefined)).toBeUndefined()
    expect(parseDeckId('not-a-uuid')).toBeUndefined()
    // Over-length: a valid UUID with trailing junk.
    expect(parseDeckId(`${DECK_ID}-extra`)).toBeUndefined()
    // Missing dashes are not the 8-4-4-4-12 shape.
    expect(parseDeckId('3f2b8c1a9d4e4c7ba1f20b6d5e8a9c10')).toBeUndefined()
  })
})

describe('parseDecksPage (KTD8)', () => {
  it('defaults to 1; 0, negative, junk and blank clamp to 1', () => {
    expect(parseDecksPage(SP(''))).toBe(1)
    expect(parseDecksPage(SP('decks=1'))).toBe(1)
    expect(parseDecksPage(SP('decks=0'))).toBe(1)
    expect(parseDecksPage(SP('decks=-3'))).toBe(1)
    expect(parseDecksPage(SP('decks=junk'))).toBe(1)
    expect(parseDecksPage(SP('decks=2.5'))).toBe(1)
  })

  it('parses real pages and clamps past the cap page count', () => {
    expect(parseDecksPage(SP('decks=2'))).toBe(2)
    expect(parseDecksPage(SP('decks=99'))).toBe(MAX_DECKS_PAGE)
  })
})

describe('buildHref deck + decks round-trip (KTD6/KTD8)', () => {
  it('emits deck after tab in the fixed order and round-trips both', () => {
    const href = fmtHref({ tab: 'decklists', deck: DECK_ID, decks: 2 })
    expect(href).toBe(`/meta/pauper?tab=decklists&deck=${DECK_ID}&decks=2`)
    const qs = href.split('?')[1] ?? ''
    expect(parseDeckId(SP(qs).deck)).toBe(DECK_ID)
    expect(parseDecksPage(SP(qs))).toBe(2)
  })

  it('omits decks=1 as the default', () => {
    expect(fmtHref({ tab: 'decklists', deck: DECK_ID, decks: 1 })).toBe(
      `/meta/pauper?tab=decklists&deck=${DECK_ID}`
    )
    expect(fmtHref({})).toBe('/meta/pauper')
  })

  it('deck and decks never leak into parseMetaQuery output', () => {
    const withDeck = parseMetaQuery('pauper', SP('deck=x&decks=2'), NOW)
    expect(withDeck).toEqual(parseMetaQuery('pauper', SP(''), NOW))
  })
})

// ---------------------------------------------------------------------------
// `?page`: the event standings page. Clamps to 1 on junk, rides last in the
// fixed buildHref order, is omitted at 1 and never enters `MetaQuery`.
// ---------------------------------------------------------------------------

describe('parsePage', () => {
  it('defaults to 1; 0, negative, junk and blank clamp to 1', () => {
    expect(parsePage(SP(''))).toBe(1)
    expect(parsePage(SP('page=1'))).toBe(1)
    expect(parsePage(SP('page=0'))).toBe(1)
    expect(parsePage(SP('page=-3'))).toBe(1)
    expect(parsePage(SP('page=junk'))).toBe(1)
    expect(parsePage(SP('page=2.5'))).toBe(1)
  })

  it('parses real pages', () => {
    expect(parsePage(SP('page=2'))).toBe(2)
    expect(parsePage(SP('page=30'))).toBe(30)
  })
})

describe('buildHref page round-trip', () => {
  it('emits page last and round-trips it', () => {
    const href = fmtHref({ path: '/tournaments/abc', page: 3 })
    expect(href).toBe('/meta/pauper/tournaments/abc?page=3')
    expect(parsePage(SP(href.split('?')[1] ?? ''))).toBe(3)
  })

  it('omits page=1 as the default', () => {
    expect(fmtHref({ path: '/tournaments/abc', page: 1 })).toBe(
      '/meta/pauper/tournaments/abc'
    )
  })

  it('never leaks into parseMetaQuery output', () => {
    expect(parseMetaQuery('pauper', SP('page=4'), NOW)).toEqual(
      parseMetaQuery('pauper', SP(''), NOW)
    )
  })
})
