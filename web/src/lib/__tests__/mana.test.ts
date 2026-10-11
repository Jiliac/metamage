import { describe, expect, it } from 'vitest'

import { parseManaCost } from '@/lib/mana'

// ---------------------------------------------------------------------------
// KTD10: `{W/U}` → `WU.svg`, `{2/W}` → `2W.svg`, `{W/P}` → `WP.svg`; the
// ` // ` separator stays visible text; unknown symbols render as text.
// ---------------------------------------------------------------------------

describe('parseManaCost', () => {
  it('{2}{W/U}{W/P} → the 2, WU and WP symbol files, alt = brace text', () => {
    expect(parseManaCost('{2}{W/U}{W/P}')).toEqual([
      { kind: 'symbol', alt: '{2}', file: '2.svg' },
      { kind: 'symbol', alt: '{W/U}', file: 'WU.svg' },
      { kind: 'symbol', alt: '{W/P}', file: 'WP.svg' },
    ])
  })

  it('"{R} // {2}{R}" keeps the split-card separator as text', () => {
    expect(parseManaCost('{R} // {2}{R}')).toEqual([
      { kind: 'symbol', alt: '{R}', file: 'R.svg' },
      { kind: 'text', text: ' // ' },
      { kind: 'symbol', alt: '{2}', file: '2.svg' },
      { kind: 'symbol', alt: '{R}', file: 'R.svg' },
    ])
  })

  it('null, undefined and empty → nothing', () => {
    expect(parseManaCost(null)).toEqual([])
    expect(parseManaCost(undefined)).toEqual([])
    expect(parseManaCost('')).toEqual([])
  })

  it('single-color and generic symbols map to their Scryfall files', () => {
    expect(parseManaCost('{W}{U}{B}{R}{G}')).toEqual([
      { kind: 'symbol', alt: '{W}', file: 'W.svg' },
      { kind: 'symbol', alt: '{U}', file: 'U.svg' },
      { kind: 'symbol', alt: '{B}', file: 'B.svg' },
      { kind: 'symbol', alt: '{R}', file: 'R.svg' },
      { kind: 'symbol', alt: '{G}', file: 'G.svg' },
    ])
    expect(parseManaCost('{X}')).toEqual([
      { kind: 'symbol', alt: '{X}', file: 'X.svg' },
    ])
    expect(parseManaCost('{C}')).toEqual([
      { kind: 'symbol', alt: '{C}', file: 'C.svg' },
    ])
    expect(parseManaCost('{15}')).toEqual([
      { kind: 'symbol', alt: '{15}', file: '15.svg' },
    ])
  })

  it('hybrid and phyrexian forms collapse their atoms into the file name', () => {
    expect(parseManaCost('{G/U}')).toEqual([
      { kind: 'symbol', alt: '{G/U}', file: 'GU.svg' },
    ])
    expect(parseManaCost('{2/W}')).toEqual([
      { kind: 'symbol', alt: '{2/W}', file: '2W.svg' },
    ])
    expect(parseManaCost('{W/P}')).toEqual([
      { kind: 'symbol', alt: '{W/P}', file: 'WP.svg' },
    ])
  })

  it('every other real Scryfall form maps to its file', () => {
    const files = (cost: string) =>
      parseManaCost(cost).map(t => (t.kind === 'symbol' ? t.file : t.text))
    // Tap, untap, energy, snow, the X/Y/Z variables, generic phyrexian.
    expect(files('{T}{Q}{E}{S}{Y}{Z}{P}')).toEqual([
      'T.svg',
      'Q.svg',
      'E.svg',
      'S.svg',
      'Y.svg',
      'Z.svg',
      'P.svg',
    ])
    // Generic 0-20 plus the two large Un-numbers.
    expect(files('{0}{20}{100}{1000000}')).toEqual([
      '0.svg',
      '20.svg',
      '100.svg',
      '1000000.svg',
    ])
    // Hybrid phyrexian, colorless hybrid, colorless phyrexian, 2/color.
    expect(files('{W/U/P}{B/G/P}{C/G}{C/P}{2/G}')).toEqual([
      'WUP.svg',
      'BGP.svg',
      'CG.svg',
      'CP.svg',
      '2G.svg',
    ])
  })

  it('unknown symbols render as their brace text', () => {
    expect(parseManaCost('{QW}')).toEqual([{ kind: 'text', text: '{QW}' }])
    expect(parseManaCost('{Y/Z}')).toEqual([{ kind: 'text', text: '{Y/Z}' }])
    expect(parseManaCost('{}')).toEqual([{ kind: 'text', text: '{}' }])
  })

  it('well-formed but non-existent symbols render as text, not a broken img', () => {
    for (const cost of [
      '{X/Y}', // two letters Scryfall ships, but no XY.svg
      '{U/W}', // a real pair in non-canonical order (the file is WU.svg)
      '{W/W}',
      '{T/P}',
      '{2/C}',
      '{3/W}',
      '{P/W}',
      '{G/U/R}',
      '{21}', // generic numbers stop at 20, then 100 and 1000000
      '{99}',
      '{007}',
      '{1234567}',
    ]) {
      expect(parseManaCost(cost), cost).toEqual([{ kind: 'text', text: cost }])
    }
  })

  it('free text between symbols survives as text', () => {
    expect(parseManaCost('{2}: pay {1}')).toEqual([
      { kind: 'symbol', alt: '{2}', file: '2.svg' },
      { kind: 'text', text: ': pay' },
      { kind: 'symbol', alt: '{1}', file: '1.svg' },
    ])
  })
})
