import { describe, expect, it } from 'vitest'

import type {
  ArchetypeDetailDTO,
  ArchetypeRef,
  DeckDTO,
  DeckSummaryDTO,
  FormatSlug,
  MetaQuery,
} from '@/datasource/types'
import {
  resolveDeckSelection,
  type DeckSelectionSource,
} from '@/lib/deck-selection'
import { asArchetypeSlug, asIsoDate } from '@/lib/params'

// ---------------------------------------------------------------------------
// The archetype page's slug + deck flow (KTD6): stale-slug redirects, the
// reclassification redirect (only to an archetype that has window data and
// resolves to itself), the window-independent `?deck` deep link, and the
// featured fetch skipped when `?deck` is valid. A small in-memory source
// stands in for the datasource.
// ---------------------------------------------------------------------------

const MODERN = 'modern' as FormatSlug

// A custom window, so buildHref keeps start/end and the asserts need no clock.
const query: MetaQuery = {
  format: MODERN,
  start: asIsoDate('2026-09-01'),
  end: asIsoDate('2026-09-30'),
  topN: 20,
  minMatches: 80,
  includeArchetypes: [],
  hideBuckets: true,
  weight: 'match',
  platform: 'all',
}

const summary = (id: string, date = '2026-09-20'): DeckSummaryDTO => ({
  id,
  player: 'Player',
  rank: 1,
  wins: 5,
  losses: 0,
  draws: 0,
  decklistUrl: null,
  event: {
    id: `ev-${id}`,
    name: 'Event',
    date: asIsoDate(date),
    link: null,
    source: 'MTGO',
  },
  hasCards: true,
})

const deck = (
  id: string,
  archetype: string,
  over: { format?: string; date?: string } = {}
): DeckDTO => ({
  format: (over.format ?? 'modern') as FormatSlug,
  archetype: { slug: asArchetypeSlug(archetype), name: archetype, color: null },
  entry: summary(id, over.date),
  main: [],
  side: [],
})

type Fixture = {
  /** slug → the ref resolveSlug returns (aliases map to their canonical). */
  slugs: Record<string, ArchetypeRef>
  /** Archetypes with window data (getArchetypeDetail non-null). */
  withData: string[]
  /** slug → window entries. */
  entries?: Record<string, DeckSummaryDTO[]>
  decks: DeckDTO[]
}

function source(f: Fixture) {
  const deckCalls: string[] = []
  const detailCalls: string[] = []
  const ds: DeckSelectionSource = {
    resolveSlug: async (_format, slug) => f.slugs[slug] ?? null,
    getArchetypeDetail: async q => {
      detailCalls.push(q.slug)
      return f.withData.includes(q.slug)
        ? ({ archetype: { slug: q.slug } } as unknown as ArchetypeDetailDTO)
        : null
    },
    getArchetypeEntries: async q => {
      const rows = f.entries?.[q.slug] ?? []
      return { total: rows.length, entries: rows }
    },
    getDeck: async q => {
      deckCalls.push(q.entryId)
      return f.decks.find(d => d.entry.id === q.entryId) ?? null
    },
  }
  return { ds, deckCalls, detailCalls }
}

const ref = (slug: string): ArchetypeRef => ({
  slug: asArchetypeSlug(slug),
  name: slug,
})

const base: Fixture = {
  slugs: { a: ref('a'), b: ref('b'), 'old-a': ref('a') },
  withData: ['a', 'b'],
  entries: { a: [summary('feat')] },
  decks: [deck('feat', 'a'), deck('mine', 'a', { date: '2026-08-15' })],
}

const run = (f: Fixture, slug: string, deckId?: string) => {
  const s = source(f)
  return {
    ...s,
    result: resolveDeckSelection(s.ds, {
      query,
      slug: asArchetypeSlug(slug),
      deckId,
      tab: undefined,
    }),
  }
}

describe('resolveDeckSelection (KTD6)', () => {
  it('unknown slug → notFound', async () => {
    expect(await run(base, 'nope').result).toEqual({ kind: 'notFound' })
  })

  it('stale slug → redirect to the canonical slug, keeping ?deck', async () => {
    const r = await run(base, 'old-a', 'mine').result
    expect(r.kind).toBe('redirect')
    if (r.kind !== 'redirect') return
    expect(r.href).toContain('/meta/modern/archetype/a?')
    expect(r.href).toContain('deck=mine')
  })

  it('no ?deck → the featured deck, fetched once', async () => {
    const { result, deckCalls } = run(base, 'a')
    const r = await result
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.featured?.id).toBe('feat')
    expect(r.deck?.entry.id).toBe('feat')
    expect(r.outsideWindow).toBe(false)
    expect(r.reclassifiedTo).toBeNull()
    expect(deckCalls).toEqual(['feat'])
  })

  it('valid ?deck → that deck, with no featured getDeck query', async () => {
    const { result, deckCalls } = run(base, 'a', 'mine')
    const r = await result
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.deck?.entry.id).toBe('mine')
    expect(r.featured?.id).toBe('feat')
    // Dated before the window: the R11 note shows.
    expect(r.outsideWindow).toBe(true)
    expect(deckCalls).toEqual(['mine'])
  })

  it('?deck from another format or unknown → falls back to the featured deck', async () => {
    const f = {
      ...base,
      decks: [...base.decks, deck('lgc', 'a', { format: 'legacy' })],
    }
    for (const id of ['lgc', 'missing']) {
      const r = await run(f, 'a', id).result
      expect(r.kind).toBe('ok')
      if (r.kind !== 'ok') return
      expect(r.deck?.entry.id).toBe('feat')
      expect(r.outsideWindow).toBe(false)
    }
  })

  it('reclassified into B with window data → redirect to B, keeping ?deck', async () => {
    const f = { ...base, decks: [...base.decks, deck('moved', 'b')] }
    const r = await run(f, 'a', 'moved').result
    expect(r.kind).toBe('redirect')
    if (r.kind !== 'redirect') return
    expect(r.href).toContain('/meta/modern/archetype/b?')
    expect(r.href).toContain('deck=moved')
  })

  it('reclassified into B without window data → shown on A with the B note', async () => {
    const f = {
      ...base,
      withData: ['a'],
      decks: [...base.decks, deck('moved', 'b')],
    }
    const r = await run(f, 'a', 'moved').result
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.deck?.entry.id).toBe('moved')
    expect(r.reclassifiedTo).toEqual({ slug: 'b', name: 'b' })
  })

  it('never redirects to a slug that does not resolve to itself (no loop)', async () => {
    // B's slug resolves back to A (two names slugifying alike), to a third
    // slug, or not at all.
    const cases: Fixture['slugs'][] = [
      { ...base.slugs, b: ref('a') },
      { ...base.slugs, b: ref('c'), c: ref('c') },
      { a: ref('a') },
    ]
    for (const slugs of cases) {
      const f = { ...base, slugs, decks: [...base.decks, deck('moved', 'b')] }
      const r = await run(f, 'a', 'moved').result
      expect(r.kind).toBe('ok')
      if (r.kind !== 'ok') return
      expect(r.deck?.entry.id).toBe('moved')
      expect(r.reclassifiedTo?.slug).toBe('b')
    }
  })

  it('A without window data but a valid ?deck → the deck, no detail', async () => {
    const f = { ...base, withData: ['b'], entries: {} }
    const r = await run(f, 'a', 'mine').result
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.detail).toBeNull()
    expect(r.deck?.entry.id).toBe('mine')
    expect(r.featured).toBeNull()
  })

  it('A without window data and no usable ?deck → notFound', async () => {
    const f = { ...base, withData: ['b'], entries: {} }
    expect(await run(f, 'a').result).toEqual({ kind: 'notFound' })
    expect(await run(f, 'a', 'missing').result).toEqual({ kind: 'notFound' })
  })
})
