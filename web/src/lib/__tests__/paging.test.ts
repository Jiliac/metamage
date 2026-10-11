import { describe, expect, it } from 'vitest'

import { pageWindow, slicePage } from '@/lib/paging'

const rows = Array.from({ length: 123 }, (_, i) => i + 1)

describe('slicePage', () => {
  it('slices the requested page and reports its bounds', () => {
    const s = slicePage(rows, 2, 50)
    expect(s.visible[0]).toBe(51)
    expect(s.visible.at(-1)).toBe(100)
    expect(s).toMatchObject({
      page: 2,
      pages: 3,
      total: 123,
      from: 51,
      to: 100,
    })
  })

  it('gives the last page its short tail', () => {
    const s = slicePage(rows, 3, 50)
    expect(s.visible).toHaveLength(23)
    expect(s).toMatchObject({ from: 101, to: 123 })
  })

  it('clamps pages past the end and below one', () => {
    expect(slicePage(rows, 99, 50).page).toBe(3)
    expect(slicePage(rows, 0, 50).page).toBe(1)
    expect(slicePage(rows, Number.NaN, 50).page).toBe(1)
  })

  it('reports one empty page for an empty list', () => {
    expect(slicePage([], 1, 50)).toEqual({
      visible: [],
      page: 1,
      pages: 1,
      total: 0,
      from: 0,
      to: 0,
    })
  })

  it('does not mutate its input', () => {
    const copy = [...rows]
    slicePage(rows, 2, 50)
    expect(rows).toEqual(copy)
  })
})

describe('pageWindow', () => {
  it('keeps the edges and a radius around the current page', () => {
    expect(pageWindow(15, 30)).toEqual([1, 'gap', 14, 15, 16, 'gap', 30])
  })

  it('shows a single skipped page instead of a gap', () => {
    expect(pageWindow(3, 30)).toEqual([1, 2, 3, 4, 'gap', 30])
    expect(pageWindow(4, 30)).toEqual([1, 2, 3, 4, 5, 'gap', 30])
  })

  it('collapses to a plain run on short lists', () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(2, 3)).toEqual([1, 2, 3])
    expect(pageWindow(1, 5)).toEqual([1, 2, 'gap', 5])
  })

  it('clamps an out-of-range page', () => {
    expect(pageWindow(40, 30)).toEqual([1, 'gap', 29, 30])
  })
})
