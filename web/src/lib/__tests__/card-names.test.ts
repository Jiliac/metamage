import { describe, expect, it } from 'vitest'

import { titleCaseName } from '@/lib/card-names'

// ---------------------------------------------------------------------------
// KTD11: title-case fallback for the lowercase DB name. Small words stay
// lowercase; words capitalize after hyphens; possessives keep their
// lowercase s.
// ---------------------------------------------------------------------------

describe('titleCaseName', () => {
  it('small words stay lowercase mid-name', () => {
    expect(titleCaseName('blade of the bloodchief')).toBe(
      'Blade of the Bloodchief'
    )
    expect(titleCaseName('one with nothing')).toBe('One with Nothing')
  })

  it('capitalizes after hyphens', () => {
    expect(titleCaseName('soul-guide lantern')).toBe('Soul-Guide Lantern')
  })

  it('capitalizes after commas and other punctuation', () => {
    expect(titleCaseName('emrakul, the promised end')).toBe(
      'Emrakul, the Promised End'
    )
  })

  it('keeps the possessive s lowercase', () => {
    expect(titleCaseName("urza's saga")).toBe("Urza's Saga")
  })

  it('always capitalizes the first word, even a small word', () => {
    expect(titleCaseName('the one ring')).toBe('The One Ring')
  })

  it('capitalizes after slashes (split cards)', () => {
    expect(titleCaseName('fire/ice')).toBe('Fire/Ice')
  })
})
