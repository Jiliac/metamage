import { describe, expect, it } from 'vitest'

import { longDate, shortDate } from '@/lib/dates'

describe('dates', () => {
  it('formats short and long display dates', () => {
    expect(shortDate('2026-05-03')).toBe('May 3')
    expect(longDate('2026-05-03')).toBe('May 3, 2026')
    expect(longDate('2026-12-31')).toBe('Dec 31, 2026')
  })
})
