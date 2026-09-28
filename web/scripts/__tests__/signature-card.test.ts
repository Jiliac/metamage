import { describe, expect, it } from 'vitest'
import {
  type CardCandidate,
  pickSignatureCard,
  rankSignatureCandidates,
} from '../signature-card'

// 100 archetype decks inside a 1000-deck format.
const card = (
  cardName: string,
  decks: number,
  fmtCardDecks: number,
  opts: { copies?: number; isLand?: boolean } = {}
): CardCandidate => ({
  cardName,
  isLand: opts.isLand ?? false,
  decks,
  copies: opts.copies ?? decks * 4,
  archDecks: 100,
  fmtCardDecks,
  fmtDecks: 1000,
})

describe('pickSignatureCard', () => {
  it('prefers a distinctive card over a format-wide staple', () => {
    const picked = pickSignatureCard('prowess', [
      card('lightning bolt', 100, 500),
      card('monastery swiftspear', 98, 110),
    ])
    expect(picked?.cardName).toBe('monastery swiftspear')
  })

  it('prefers a card named by the archetype', () => {
    const picked = pickSignatureCard('broodscale', [
      card("kozilek's command", 100, 100),
      card('blade of the bloodchief', 100, 100),
      card('basking broodscale', 90, 95),
    ])
    expect(picked?.cardName).toBe('basking broodscale')
  })

  it('never name-matches on colour or strategy words', () => {
    const picked = pickSignatureCard('azorius control', [
      card('azorius charm', 60, 70),
      card('teferi, time raveler', 98, 120),
    ])
    expect(picked?.cardName).toBe('teferi, time raveler')
  })

  it('matches the front face of a double-faced card and plural forms', () => {
    const picked = pickSignatureCard('temur rhinos', [
      card('crashing footfalls', 100, 100),
      card('rhino // horn', 80, 90),
    ])
    expect(picked?.cardName).toBe('rhino // horn')
  })

  it('excludes lands and cards below the presence floor', () => {
    const picked = pickSignatureCard('tron', [
      card("urza's tower", 100, 100, { isLand: true }),
      card('rare tech', 30, 30),
      card('expedition map', 99, 110),
    ])
    expect(picked?.cardName).toBe('expedition map')
  })

  it('discounts 1-of silver bullets against 4-of cores', () => {
    const picked = pickSignatureCard('devoted combo', [
      card('vizier of remedies', 100, 100, { copies: 110 }),
      card('nature rhythm', 99, 100),
    ])
    expect(picked?.cardName).toBe('nature rhythm')
  })

  it('falls back to the most-played non-land card for incoherent buckets', () => {
    const picked = pickSignatureCard('other', [
      card('brainstorm', 40, 600),
      card('ponder', 30, 500),
    ])
    expect(picked?.cardName).toBe('brainstorm')
  })

  it('is deterministic on exact ties', () => {
    const cands = [card('b card', 100, 100), card('a card', 100, 100)]
    expect(pickSignatureCard('x', cands)?.cardName).toBe('a card')
    expect(pickSignatureCard('x', [...cands].reverse())?.cardName).toBe(
      'a card'
    )
  })

  it('does not name-match generic words (free spells)', () => {
    const picked = pickSignatureCard('free spells', [
      // pArch .9, pRest .3: a positive score, but a format-wide staple
      card('spell pierce', 90, 360),
      card('mutagenic growth', 100, 110),
    ])
    expect(picked?.cardName).toBe('mutagenic growth')
  })

  it('does not name-match generic words (oops all spells)', () => {
    const picked = pickSignatureCard('oops all spells', [
      // pArch .7, pRest .67
      card('spell pierce', 70, 673),
      card('balustrade spy', 100, 100),
    ])
    expect(picked?.cardName).toBe('balustrade spy')
  })

  it('lets a distinctive name match beat a higher-scoring card', () => {
    const picked = pickSignatureCard('izzet murktide', [
      // score .9
      card("dragon's rage channeler", 100, 190),
      // score .75
      card('murktide regent', 95, 275),
    ])
    expect(picked?.cardName).toBe('murktide regent')
  })

  it.each([
    ['negative', 690],
    ['zero', 600],
  ])(
    'does not let a name match with %s score beat a better card',
    (_label, boltFmtDecks) => {
      const picked = pickSignatureCard('jeskai bolt', [
        // pArch .6, pRest .7 (negative) or .6 (zero)
        card('lightning bolt', 60, boltFmtDecks),
        card('ragavan, nimble pilferer', 90, 180),
      ])
      expect(picked?.cardName).toBe('ragavan, nimble pilferer')
    }
  )

  it('still ranks a non-distinctive name match by score', () => {
    const picked = pickSignatureCard('jeskai bolt', [
      // score -.3
      card('counterspell', 50, 770),
      // score -.1
      card('lightning bolt', 60, 690),
    ])
    expect(picked?.cardName).toBe('lightning bolt')
  })

  it('matches names case-insensitively', () => {
    const picked = pickSignatureCard('Izzet MURKTIDE', [
      card("Dragon's Rage Channeler", 100, 190),
      card('Murktide Regent', 95, 275),
    ])
    expect(picked?.cardName).toBe('Murktide Regent')
  })

  it('returns null for empty input', () => {
    expect(pickSignatureCard('anything', [])).toBeNull()
  })

  it('returns null when every candidate is a land', () => {
    const picked = pickSignatureCard('lands', [
      card('dark depths', 100, 110, { isLand: true }),
      card("thespian's stage", 100, 120, { isLand: true }),
    ])
    expect(picked).toBeNull()
  })

  it('handles an archetype that is the whole format (no rest decks)', () => {
    const [ranked] = rankSignatureCandidates('x', [
      { ...card('solo card', 100, 100), fmtDecks: 100 },
    ])
    expect(ranked.pRest).toBe(0)
    expect(ranked.score).toBe(1)
  })

  it('skips lands in the fallback path', () => {
    const picked = pickSignatureCard('other', [
      card('mountain', 45, 500, { isLand: true }),
      card('brainstorm', 40, 600),
    ])
    expect(picked?.cardName).toBe('brainstorm')
  })

  it('caps the copies factor at 4 copies per deck', () => {
    const ranked = rankSignatureCandidates('x', [
      card('eight-of', 100, 100, { copies: 800 }),
      card('four-of', 100, 100, { copies: 400 }),
    ])
    expect(ranked.map(c => [c.cardName, c.avgCopies, c.score])).toEqual([
      ['eight-of', 8, 1],
      ['four-of', 4, 1],
    ])
  })

  it('does not mutate its inputs', () => {
    const cands = Object.freeze([
      Object.freeze(card('b card', 100, 100)),
      Object.freeze(card('a card', 100, 100)),
    ])
    expect(pickSignatureCard('x', cands)?.cardName).toBe('a card')
    expect(cands.map(c => c.cardName)).toEqual(['b card', 'a card'])
  })
})
