import { describe, expect, it } from 'vitest'

import { ciText, inkFill, pctI, rec } from '@/lib/ink'

// ---------------------------------------------------------------------------
// KTD2: the matrix grid and the matchup list render the SAME numbers from
// these helpers. Locking the exact strings here means a change to the §9-rule-5
// math has to be a deliberate edit, never a silent fork between surfaces.
// ---------------------------------------------------------------------------

describe('inkFill (§9 rule 5)', () => {
  it('uses the good pole at or above 50% and the bad pole below', () => {
    expect(inkFill(0.5, 1)).toContain('var(--good)')
    expect(inkFill(0.62, 1)).toContain('var(--good)')
    expect(inkFill(0.38, 1)).toContain('var(--bad)')
  })

  it('mixes in oklab against the raised surface', () => {
    expect(inkFill(0.55, 0.5)).toMatch(
      /^color-mix\(in oklab, var\(--(good|bad)\) \d+\.\d%, var\(--raised\)\)$/
    )
  })

  it('grows ink with deviation from 50% and with reliability', () => {
    const amt = (s: string) => Number(/ (\d+\.\d)%/.exec(s)![1])
    expect(amt(inkFill(0.5, 1))).toBe(6)
    expect(amt(inkFill(0.6, 1))).toBeGreaterThan(amt(inkFill(0.55, 1)))
    expect(amt(inkFill(0.6, 1))).toBeGreaterThan(amt(inkFill(0.6, 0.2)))
  })

  it('caps deviation at 28 points and clamps reliability to 0..1', () => {
    expect(inkFill(0.9, 1)).toBe(inkFill(0.78, 1))
    expect(inkFill(0.9, 5)).toBe(inkFill(0.9, 1))
    expect(inkFill(0.9, -1)).toBe(inkFill(0.9, 0))
  })

  it('pins the exact string for a representative cell', () => {
    // dev = 10, conf = 0.5 → (6 + 21) × 0.675 = 18.225 → "18.2%"
    expect(inkFill(0.6, 0.5)).toBe(
      'color-mix(in oklab, var(--good) 18.2%, var(--raised))'
    )
  })
})

describe('text helpers', () => {
  it('pctI rounds to an integer percent', () => {
    expect(pctI(0.475)).toBe('48%')
    expect(pctI(0.5)).toBe('50%')
    expect(pctI(0)).toBe('0%')
  })

  it('rec joins with an en dash', () => {
    expect(rec(12, 8)).toBe('12–8')
  })

  it('ciText renders one-decimal bounds with an en dash', () => {
    expect(ciText(0.4741, 0.5566)).toBe('47.4–55.7')
  })
})
