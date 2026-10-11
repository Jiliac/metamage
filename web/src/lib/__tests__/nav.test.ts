import { describe, expect, it } from 'vitest'

import { DEFAULT_FORMAT } from '@/datasource/format-order'
import { isNavActive, navFormat } from '@/lib/nav'

describe('isNavActive', () => {
  it.each([
    // [itemSub, subPath, active]
    ['', '', true],
    ['', '/archetype/azorius-control', true],
    ['', '/matrix', false],
    ['', '/tournaments', false],
    ['', '/tournaments/abc', false],
    ['/matrix', '/matrix', true],
    ['/tournaments', '/tournaments', true],
    ['/tournaments', '/tournaments/abc', true],
    ['/tournaments', '/tournamentsx', false],
    ['/changes', '/tournaments', false],
  ])('item %j on %j → %s', (itemSub, subPath, active) => {
    expect(isNavActive(itemSub, subPath)).toBe(active)
  })
})

describe('navFormat', () => {
  it('keeps `all` only on the tournaments item', () => {
    expect(navFormat('all', '/tournaments')).toBe('all')
    expect(navFormat('all', '')).toBe(DEFAULT_FORMAT)
    expect(navFormat('all', '/matrix')).toBe(DEFAULT_FORMAT)
    expect(navFormat('all', '/changes')).toBe(DEFAULT_FORMAT)
  })

  it('leaves real formats alone', () => {
    expect(navFormat('pauper', '')).toBe('pauper')
    expect(navFormat('pauper', '/tournaments')).toBe('pauper')
  })
})
