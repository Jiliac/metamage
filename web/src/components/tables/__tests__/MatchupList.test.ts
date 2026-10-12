import { describe, expect, it } from 'vitest'

import type { MatchupCellDTO } from '@/datasource/types'
import { asArchetypeSlug } from '@/lib/params'
import { needsLowSampleHedge, sortCells } from '@/components/tables/MatchupList'

// ---------------------------------------------------------------------------
// The pure halves of MatchupList: the two list orderings and the hedge. Rendering is left to the smoke
// matrix; these lock the facts the list is built from.
// ---------------------------------------------------------------------------

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

describe('needsLowSampleHedge', () => {
  const cell = (games: number, lowN: boolean) =>
    ({ games, lowN }) as unknown as MatchupCellDTO

  it('hedges when most of the games sit in low-N pairings', () => {
    expect(
      needsLowSampleHedge([cell(3, true), cell(4, true), cell(5, false)])
    ).toBe(true)
  })

  it('does not hedge a well-sampled archetype with a long thin tail', () => {
    const tail = Array.from({ length: 40 }, () => cell(2, true))
    expect(
      needsLowSampleHedge([cell(241, false), cell(188, false), ...tail])
    ).toBe(false)
  })

  it('hedges an empty row', () => {
    expect(needsLowSampleHedge([])).toBe(true)
    expect(needsLowSampleHedge([cell(0, true)])).toBe(true)
  })
})
