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

  it('capitalizes non-ASCII initials, including after hyphens', () => {
    expect(titleCaseName('éowyn, fearless knight')).toBe(
      'Éowyn, Fearless Knight'
    )
    expect(titleCaseName('ætherling')).toBe('Ætherling')
    expect(titleCaseName("ûro, titan of nature's wrath")).toBe(
      "Ûro, Titan of Nature's Wrath"
    )
    expect(titleCaseName("lim-dûl's vault")).toBe("Lim-Dûl's Vault")
    expect(titleCaseName('fire-éowyn')).toBe('Fire-Éowyn')
  })

  it('treats Object.prototype keys as ordinary words, not small words', () => {
    // The two all-lowercase prototype keys: a plain-object lookup found them.
    expect(titleCaseName('the constructor tower')).toBe('The Constructor Tower')
    expect(titleCaseName('a __proto__ b')).toBe('A __proto__ B')
  })
})
