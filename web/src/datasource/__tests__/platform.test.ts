import { describe, expect, it } from 'vitest'

import { matchesPlatform, platformScope } from '@/datasource/platform'

describe('matchesPlatform', () => {
  it('keeps every source under all', () => {
    for (const s of ['MTGO', 'MELEE', 'CARDSREALM', 'OTHER'] as const) {
      expect(matchesPlatform(s, 'all')).toBe(true)
    }
  })

  it('treats Magic Online as the only online source', () => {
    expect(matchesPlatform('MTGO', 'online')).toBe(true)
    expect(matchesPlatform('MELEE', 'online')).toBe(false)
    expect(matchesPlatform('CARDSREALM', 'online')).toBe(false)
    expect(matchesPlatform('OTHER', 'online')).toBe(false)
  })

  it('treats every other source as paper', () => {
    expect(matchesPlatform('MTGO', 'paper')).toBe(false)
    expect(matchesPlatform('MELEE', 'paper')).toBe(true)
    expect(matchesPlatform('CARDSREALM', 'paper')).toBe(true)
    expect(matchesPlatform('OTHER', 'paper')).toBe(true)
  })
})

describe('platformScope', () => {
  it('names a filtered platform and stays silent for all', () => {
    expect(platformScope('all')).toBe('')
    expect(platformScope('online')).toBe(' · Online only')
    expect(platformScope('paper')).toBe(' · Paper only')
  })
})
