import { describe, expect, it } from 'vitest'

import type { MatchupCellDTO, MatrixOrderEntryDTO } from '@/datasource/types'
import { asArchetypeSlug } from '@/lib/params'
import { selectRowCells, sortCells } from '@/components/tables/MatchupList'

// ---------------------------------------------------------------------------
// The pure halves of MatchupList: slicing a `?row` out of the zero-filled
// matrix (KTD4) and the two list orderings. Rendering is left to the smoke
// matrix; these lock the facts the list is built from.
// ---------------------------------------------------------------------------

const entry = (
  slug: string,
  name: string,
  presenceRank: number
): MatrixOrderEntryDTO => ({
  slug: asArchetypeSlug(slug),
  name,
  color: null,
  globalWr: null,
  share: 0.1,
  matches: 100,
  presenceRank,
})

const ORDER = [
  entry('mono-blue-faeries', 'Mono Blue Faeries', 1),
  entry('boros-dwarves', 'Boros Dwarves', 2),
  entry('dimir-control', 'Dimir Control', 3),
]

const cell = (
  row: string,
  col: string,
  over: Partial<MatchupCellDTO> = {}
): MatchupCellDTO => {
  const games = over.games ?? 20
  return {
    rowSlug: asArchetypeSlug(row),
    colSlug: asArchetypeSlug(col),
    rowName: row,
    colName: col,
    wins: 10,
    losses: 10,
    draws: 0,
    games,
    wr: 0.5,
    ciLow: 0.3,
    ciHigh: 0.7,
    reliability: Math.min(1, games / 50),
    lowN: games < 5,
    ciCrosses50: true,
    isMirror: row === col,
    ...over,
  }
}

const FULL_GRID = ORDER.flatMap(r =>
  ORDER.map(c => cell(r.slug, c.slug, { isMirror: r.slug === c.slug }))
)

describe('selectRowCells', () => {
  it('slices the selected row, dropping the mirror cell', () => {
    const picked = selectRowCells(
      { order: ORDER, cells: FULL_GRID },
      'boros-dwarves'
    )
    expect(picked.slug).toBe('boros-dwarves')
    expect(picked.name).toBe('Boros Dwarves')
    expect(picked.cells.map(c => c.colSlug)).toEqual([
      'mono-blue-faeries',
      'dimir-control',
    ])
    expect(picked.cells.every(c => c.rowSlug === 'boros-dwarves')).toBe(true)
  })

  it('falls back to presence rank 1 for null or unknown rows', () => {
    const grid = { order: ORDER, cells: FULL_GRID }
    expect(selectRowCells(grid, null).slug).toBe('mono-blue-faeries')
    expect(selectRowCells(grid, undefined).slug).toBe('mono-blue-faeries')
    expect(selectRowCells(grid, 'goblin-bikeshed').slug).toBe(
      'mono-blue-faeries'
    )
  })

  it('maps every ordered archetype to its presence rank', () => {
    const { ranks } = selectRowCells({ order: ORDER, cells: FULL_GRID }, null)
    expect(ranks).toEqual({
      'mono-blue-faeries': 1,
      'boros-dwarves': 2,
      'dimir-control': 3,
    })
  })
})

describe('sortCells', () => {
  const a = cell('x', 'a', { games: 40, wr: 0.6 })
  const b = cell('x', 'b', { games: 10, wr: 0.4 })
  const c = cell('x', 'c', { games: 0, wr: 0, lowN: true })
  const d = cell('x', 'd', { games: 40, wr: 0.3 })
  const input = [c, a, b, d]

  it('games: volume desc, then win rate desc; does not mutate input', () => {
    const before = [...input]
    expect(sortCells(input, 'games').map(x => x.colSlug)).toEqual([
      'a',
      'd',
      'b',
      'c',
    ])
    expect(input).toEqual(before)
  })

  it('wrAsc: worst supported matchups first, no-data pairs last', () => {
    expect(sortCells(input, 'wrAsc').map(x => x.colSlug)).toEqual([
      'd',
      'b',
      'a',
      'c',
    ])
  })
})
