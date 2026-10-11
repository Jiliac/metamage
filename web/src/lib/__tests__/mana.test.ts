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

  it('unknown symbols render as their brace text', () => {
    expect(parseManaCost('{QW}')).toEqual([{ kind: 'text', text: '{QW}' }])
    expect(parseManaCost('{Y/Z}')).toEqual([{ kind: 'text', text: '{Y/Z}' }])
    expect(parseManaCost('{}')).toEqual([{ kind: 'text', text: '{}' }])
  })

  it('free text between symbols survives as text', () => {
    expect(parseManaCost('{2}: pay {1}')).toEqual([
      { kind: 'symbol', alt: '{2}', file: '2.svg' },
      { kind: 'text', text: ': pay' },
      { kind: 'symbol', alt: '{1}', file: '1.svg' },
    ])
  })
})
