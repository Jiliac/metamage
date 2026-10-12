import { describe, expect, it } from 'vitest'

import type { MatrixOrderEntryDTO } from '@/datasource/types'
import { asArchetypeSlug } from '@/lib/params'
import { resolvePick } from '@/components/charts/CompactMatrix'

// ---------------------------------------------------------------------------
// The compact grid's tap selection is held by archetype, not by position: a
// lens change (grid size, window, platform) swaps the order under a mounted
// component, and the pick must follow its archetypes or drop, never index
// past the new order.
// ---------------------------------------------------------------------------

const entry = (slug: string, presenceRank: number): MatrixOrderEntryDTO => ({
  slug: asArchetypeSlug(slug),
  name: slug,
  color: null,
  globalWr: null,
  share: 0.1,
  matches: 100,
  presenceRank,
})

const s = asArchetypeSlug
const ORDER = ['a', 'b', 'c', 'd'].map((x, i) => entry(x, i + 1))

describe('resolvePick', () => {
  it('maps a slug pair to its row and column in the current order', () => {
    expect(resolvePick(ORDER, { row: s('c'), col: s('a') })).toMatchObject({
      r: 2,
      c: 0,
      row: { slug: 'c' },
      col: { slug: 'a' },
    })
  })

  it('follows the archetypes when the order is reshuffled', () => {
    const reordered = [ORDER[3], ORDER[2], ORDER[1], ORDER[0]]
    expect(resolvePick(reordered, { row: s('c'), col: s('a') })).toMatchObject({
      r: 1,
      c: 3,
    })
  })

  it('drops the pick when either archetype left the grid', () => {
    const smaller = ORDER.slice(0, 2)
    expect(resolvePick(smaller, { row: s('d'), col: s('a') })).toBeNull()
    expect(resolvePick(smaller, { row: s('a'), col: s('c') })).toBeNull()
    expect(resolvePick([], { row: s('a'), col: s('b') })).toBeNull()
  })

  it('is null when nothing is picked', () => {
    expect(resolvePick(ORDER, null)).toBeNull()
  })
})
