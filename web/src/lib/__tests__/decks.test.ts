import { describe, expect, it } from 'vitest'

import type { DeckCardDTO, DeckSummaryDTO } from '@/datasource/types'
import { ARCHETYPE_ENTRIES_CAP } from '@/datasource/types'
import {
  MAX_DECKS_PAGE,
  deckResultLabel,
  deckTypeBucket,
  decksCapLabel,
  featuredPoints,
  formatInt,
  groupEntriesByEvent,
  groupMaindeck,
  isOutsideWindow,
  pickFeaturedDeck,
  recordFootnote,
  safeExternalHref,
  sliceRecentDecks,
  sortSideboard,
} from '@/lib/decks'

// ---------------------------------------------------------------------------
// Plan §U5: pure deck logic — featured pick (KTD4), event grouping (R9),
// paging (KTD8/R12), type bucketing (KTD5/R3–R5) and the placing/record label
// (R2/R9). All inputs are plain DTOs; no datasource, no clock.
// ---------------------------------------------------------------------------

const entry = (
  id: string,
  date: string,
  over: Partial<DeckSummaryDTO> = {}
): DeckSummaryDTO => ({
  id,
  player: 'Player',
  rank: null,
  wins: 0,
  losses: 0,
  draws: 0,
  decklistUrl: null,
  event: {
    id: `ev-${id}`,
    name: 'Event',
    date: date as DeckSummaryDTO['event']['date'],
    link: null,
    source: 'MTGO',
  },
  hasCards: true,
  ...over,
})

const card = (name: string, over: Partial<DeckCardDTO> = {}): DeckCardDTO => ({
  cardId: `card-${name}`,
  name,
  board: 'MAIN',
  count: 1,
  typeLine: null,
  manaCost: null,
  cmc: null,
  imageNormal: null,
  imageBack: null,
  scryfallUri: null,
  ...over,
})

describe('pickFeaturedDeck (KTD4)', () => {
  it('happy path: highest 3W+D inside the window wins over an older higher-point entry', () => {
    const entries = [
      entry('recent-high', '2026-06-10', { wins: 4 }), // 12 pts, in window
      entry('newest', '2026-06-14', { wins: 3 }), // 9 pts, sets the anchor
      entry('ancient', '2026-05-20', { wins: 10 }), // 30 pts, 25 days before the anchor
    ]
    expect(pickFeaturedDeck(entries)?.id).toBe('recent-high')
  })

  it('boundary: exactly 13 days before the anchor is a candidate; 14 days is not', () => {
    // Anchor 2026-06-15: near sits at anchor − 13, far at anchor − 14.
    const anchor = entry('anchor', '2026-06-15') // 0 pts
    const near = entry('near', '2026-06-02', { wins: 2 }) // 6 pts, in window
    const far = entry('far', '2026-06-01', { wins: 9 }) // 27 pts, one day too old
    expect(pickFeaturedDeck([anchor, near, far])?.id).toBe('near')
    // Once `far` is itself the newest entry it sets the anchor and qualifies.
    expect(pickFeaturedDeck([far])?.id).toBe('far')
  })

  it('anchor: an archetype whose newest entry is 20 days before window end still gets a pick', () => {
    const entries = [
      entry('stale-top', '2026-05-20', { wins: 5 }), // 15 pts, inside the anchor window
      entry('stale-latest', '2026-05-26', { wins: 1 }), // 3 pts, sets the anchor
    ]
    expect(pickFeaturedDeck(entries)?.id).toBe('stale-top')
  })

  it('ties: equal points go to the newer date', () => {
    const older = entry('older', '2026-06-10', { wins: 2, draws: 1 })
    const newer = entry('newer', '2026-06-12', { wins: 2, draws: 1 })
    expect(pickFeaturedDeck([older, newer])?.id).toBe('newer')
  })

  it('ties: same date goes to rank 3 over rank 0, then to the lower entry id', () => {
    const unranked = entry('zzz', '2026-06-12')
    const third = entry('mmm', '2026-06-12', { rank: 3 })
    expect(pickFeaturedDeck([unranked, third])?.id).toBe('mmm')
    const other = entry('aaa', '2026-06-12')
    expect(pickFeaturedDeck([unranked, other])?.id).toBe('aaa')
    // Explicit rank 0 behaves exactly like the unranked null.
    const zero = entry('bbb', '2026-06-12', { rank: 0 })
    expect(pickFeaturedDeck([zero, other])?.id).toBe('aaa')
  })

  it('empty decks: an entry without cards is never picked', () => {
    const listless = entry('listless', '2026-06-14', {
      wins: 9,
      hasCards: false,
    })
    const listed = entry('listed', '2026-06-10', { wins: 1 })
    expect(pickFeaturedDeck([listless, listed])?.id).toBe('listed')
    expect(pickFeaturedDeck([listless])).toBeNull()
  })

  it('no candidates: no entries, or no entries with cards, → null', () => {
    expect(pickFeaturedDeck([])).toBeNull()
  })

  it('score: 3·wins + draws', () => {
    expect(
      featuredPoints(entry('x', '2026-06-01', { wins: 5, draws: 2 }))
    ).toBe(17)
    expect(
      featuredPoints(entry('x', '2026-06-01', { wins: 0, draws: 0 }))
    ).toBe(0)
  })
})

describe('groupMaindeck (KTD5, R3–R5)', () => {
  it('multi-type priority: "Artifact Creature" → Creatures, "Land Creature" → Lands', () => {
    const groups = groupMaindeck([
      card('ornithopter', {
        typeLine: 'Artifact Creature — Construct',
        count: 4,
        manaCost: '{0}',
        cmc: 0,
      }),
      card('dryad arbor', {
        typeLine: 'Land Creature — Forest Dryad',
        count: 1,
      }),
      card('murder', { typeLine: 'Instant', count: 4, cmc: 3 }),
      card('forest', { typeLine: 'Basic Land — Forest', count: 17 }),
    ])
    expect(groups.map(g => g.key)).toEqual(['creatures', 'instants', 'lands'])
    expect(groups.map(g => g.label)).toEqual(['Creatures', 'Instants', 'Lands'])
    expect(groups.map(g => g.count)).toEqual([4, 4, 18])
  })

  it('split face: the front face decides — "Instant // Land" → Instants', () => {
    expect(deckTypeBucket('Instant // Land')).toBe('instants')
  })

  it('null type → Other', () => {
    expect(deckTypeBucket(null)).toBe('other')
    const groups = groupMaindeck([card('mystery card', { count: 2 })])
    expect(groups.map(g => g.key)).toEqual(['other'])
    expect(groups.map(g => g.label)).toEqual(['Other'])
    expect(groups.map(g => g.count)).toEqual([2])
  })

  it('fixed display order (R3), only non-empty groups, summed counts', () => {
    const groups = groupMaindeck([
      card('planeswalker', { typeLine: 'Planeswalker — Jace', cmc: 4 }),
      card('battle', { typeLine: 'Battle — Siege', cmc: 5 }),
      card('instant', { typeLine: 'Instant', count: 3, cmc: 1 }),
      card('sorcery', { typeLine: 'Sorcery', count: 2, cmc: 2 }),
      card('artifact', { typeLine: 'Artifact', cmc: 1 }),
      card('enchantment', { typeLine: 'Enchantment', count: 2, cmc: 1 }),
      card('creature', { typeLine: 'Creature — Human', count: 3, cmc: 2 }),
    ])
    expect(groups.map(g => g.key)).toEqual([
      'creatures',
      'planeswalkers',
      'battles',
      'instants',
      'sorceries',
      'artifacts',
      'enchantments',
    ])
    expect(groups.find(g => g.key === 'instants')?.count).toBe(3)
  })

  it('within a group, cards sort by cmc then name; missing cmc sinks', () => {
    const group = groupMaindeck([
      card('zephyr', { typeLine: 'Creature', cmc: 2 }),
      card('alpha', { typeLine: 'Creature', cmc: 2 }),
      card('beta', { typeLine: 'Creature', cmc: 1 }),
      card('mystery', { typeLine: 'Creature' }), // cmc null
    ])[0]
    expect(group.cards.map(c => c.name)).toEqual([
      'beta',
      'alpha',
      'zephyr',
      'mystery',
    ])
  })

  it('sideboard: one flat list, count descending, then name (R6)', () => {
    const side = sortSideboard([
      card('ancient grudge', { board: 'SIDE', count: 1 }),
      card('force of vigor', { board: 'SIDE', count: 4 }),
      card('veil of summer', { board: 'SIDE', count: 2 }),
    ])
    expect(side.map(c => c.name)).toEqual([
      'force of vigor',
      'veil of summer',
      'ancient grudge',
    ])
  })
})

describe('groupEntriesByEvent (R9)', () => {
  it('groups rows by event, keeping newest-first order across events', () => {
    const ev = (id: string, date: string) => ({
      id,
      name: id,
      date: date as DeckSummaryDTO['event']['date'],
      link: null,
      source: 'MTGO' as const,
    })
    const entries = [
      entry('b2', '2026-06-12', { event: ev('evA', '2026-06-12') }),
      entry('b1', '2026-06-12', { event: ev('evA', '2026-06-12') }),
      entry('a1', '2026-06-10', { event: ev('evB', '2026-06-10') }),
    ]
    const groups = groupEntriesByEvent(entries)
    expect(groups.map(g => g.event.id)).toEqual(['evA', 'evB'])
    expect(groups[0].entries.map(e => e.id)).toEqual(['b2', 'b1'])
  })
})

describe('sliceRecentDecks (KTD8, R12)', () => {
  const MANY = Array.from({ length: 250 }, (_, i) =>
    entry(`id-${i}`, '2026-06-01')
  )

  it('page 1 slices 50 rows; page 2 slices 100', () => {
    const p1 = sliceRecentDecks(MANY, 250, 1)
    expect(p1.visible).toHaveLength(50)
    expect(p1.shown).toBe(50)
    expect(p1.hasMore).toBe(true)
    expect(p1.capReached).toBe(false)

    const p2 = sliceRecentDecks(MANY, 250, 2)
    expect(p2.visible).toHaveLength(100)
    expect(p2.shown).toBe(100)
    expect(p2.hasMore).toBe(true)
  })

  it('cap: 2,000 loaded of 3,041 total → the last page reports the cap and offers no further page', () => {
    const capped = Array.from({ length: ARCHETYPE_ENTRIES_CAP }, (_, i) =>
      entry(`cap-${i}`, '2026-06-01')
    )
    const last = sliceRecentDecks(capped, 3041, MAX_DECKS_PAGE)
    expect(last.shown).toBe(2000)
    expect(last.visible).toHaveLength(2000)
    expect(last.capReached).toBe(true)
    expect(last.hasMore).toBe(false)
    expect(decksCapLabel(last.shown, last.total)).toBe(
      'Showing the newest 2,000 of 3,041 decks'
    )
  })

  it('before the cap the last page still exists at the cap page count', () => {
    const mid = sliceRecentDecks(MANY, 250, MAX_DECKS_PAGE)
    expect(mid.shown).toBe(250)
    expect(mid.capReached).toBe(false)
    expect(mid.hasMore).toBe(false)
  })

  it('the whole list is shown once the page passes the row count', () => {
    const few = [entry('only', '2026-06-01')]
    const page = sliceRecentDecks(few, 1, 3)
    expect(page.shown).toBe(1)
    expect(page.hasMore).toBe(false)
    expect(page.capReached).toBe(false)
  })
})

describe('isOutsideWindow (R11)', () => {
  const window = { start: '2026-09-07', end: '2026-10-06' }

  it('treats both window ends as inside', () => {
    expect(isOutsideWindow('2026-09-07', window)).toBe(false)
    expect(isOutsideWindow('2026-10-06', window)).toBe(false)
  })

  it('flags dates before the start or after the end', () => {
    expect(isOutsideWindow('2026-09-06', window)).toBe(true)
    expect(isOutsideWindow('2026-10-07', window)).toBe(true)
  })

  it('keeps an in-window deck inside even past the entries cap', () => {
    // The page used to test membership in the capped entry list; a deck
    // older than the 2,000th row of a long window is still in the window.
    expect(
      isOutsideWindow('2026-04-15', { ...window, start: '2026-04-01' })
    ).toBe(false)
  })
})

describe('deckResultLabel (R2, R9)', () => {
  it('rank 1 → "1st", with the full ordinal set', () => {
    expect(deckResultLabel({ rank: 1, wins: 0, losses: 0, draws: 0 })).toBe(
      '1st'
    )
    expect(deckResultLabel({ rank: 2, wins: 0, losses: 0, draws: 0 })).toBe(
      '2nd'
    )
    expect(deckResultLabel({ rank: 3, wins: 0, losses: 0, draws: 0 })).toBe(
      '3rd'
    )
    expect(deckResultLabel({ rank: 4, wins: 0, losses: 0, draws: 0 })).toBe(
      '4th'
    )
    expect(deckResultLabel({ rank: 11, wins: 0, losses: 0, draws: 0 })).toBe(
      '11th'
    )
    expect(deckResultLabel({ rank: 21, wins: 0, losses: 0, draws: 0 })).toBe(
      '21st'
    )
    expect(deckResultLabel({ rank: 64, wins: 0, losses: 0, draws: 0 })).toBe(
      '64th'
    )
    expect(deckResultLabel({ rank: 111, wins: 0, losses: 0, draws: 0 })).toBe(
      '111th'
    )
  })

  it('rank 0 (or null) with a record → "W-L", draws appended when nonzero', () => {
    expect(deckResultLabel({ rank: 0, wins: 5, losses: 1, draws: 0 })).toBe(
      '5-1'
    )
    expect(deckResultLabel({ rank: null, wins: 3, losses: 3, draws: 1 })).toBe(
      '3-3-1'
    )
  })

  it('rank and record together → "placing · record"', () => {
    expect(deckResultLabel({ rank: 1, wins: 7, losses: 0, draws: 0 })).toBe(
      '1st · 7-0'
    )
    expect(deckResultLabel({ rank: 2, wins: 4, losses: 2, draws: 1 })).toBe(
      '2nd · 4-2-1'
    )
    expect(deckResultLabel({ rank: 21, wins: 0, losses: 1, draws: 0 })).toBe(
      '21st · 0-1'
    )
  })

  it('rank 0 with 0-0-0 → no label', () => {
    expect(
      deckResultLabel({ rank: 0, wins: 0, losses: 0, draws: 0 })
    ).toBeNull()
    expect(
      deckResultLabel({ rank: null, wins: 0, losses: 0, draws: 0 })
    ).toBeNull()
  })
})

describe('recordFootnote', () => {
  it('no MTGO deck on screen → no footnote', () => {
    expect(recordFootnote([])).toBeNull()
    expect(recordFootnote(['MELEE', 'CARDSREALM', 'OTHER'])).toBeNull()
  })

  it('MTGO without Melee → the MTGO caveat only', () => {
    const note = recordFootnote(['MTGO', 'CARDSREALM'])
    expect(note).toMatch(/^MTGO win–loss records .* often partial\.$/)
    expect(note).not.toContain('Melee')
  })

  it('MTGO with Melee → the caveat plus the Melee sentence', () => {
    expect(recordFootnote(['MELEE', 'MTGO'])).toMatch(
      /often partial\. Melee records are complete\.$/
    )
  })
})

describe('formatInt', () => {
  it('thousand separators, no locale dependence', () => {
    expect(formatInt(2000)).toBe('2,000')
    expect(formatInt(3041)).toBe('3,041')
    expect(formatInt(999)).toBe('999')
    expect(formatInt(1_234_567)).toBe('1,234,567')
  })
})

describe('safeExternalHref (R2 source link)', () => {
  it('keeps http and https URLs, any case', () => {
    expect(safeExternalHref('https://mtgo.com/decklist/1')).toBe(
      'https://mtgo.com/decklist/1'
    )
    expect(safeExternalHref('http://melee.gg/Decklist/View/2')).toBe(
      'http://melee.gg/Decklist/View/2'
    )
    expect(safeExternalHref('HTTPS://example.com')).toBe('HTTPS://example.com')
  })

  it('drops scraped values that are not http(s) URLs', () => {
    expect(safeExternalHref('javascript:alert(1)')).toBeNull()
    expect(safeExternalHref(' https://example.com')).toBeNull()
    expect(safeExternalHref('data:text/html,hi')).toBeNull()
    expect(safeExternalHref('//example.com')).toBeNull()
    expect(safeExternalHref('/relative')).toBeNull()
    expect(safeExternalHref('')).toBeNull()
    expect(safeExternalHref(null)).toBeNull()
    expect(safeExternalHref(undefined)).toBeNull()
  })
})
