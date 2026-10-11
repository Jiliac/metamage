import { describe, expect, it } from 'vitest'

import artMap from '@/datasource/art-map.json'
import {
  cardDisplayName,
  mapCardAdoptionRow,
  mapDeckRows,
  mapEntryListRows,
} from '@/datasource/postgres'
import {
  ZERO_REC,
  matchupIndex,
  orientedPair,
} from '@/datasource/postgres/matchups'
import {
  archetypeDisplayName,
  artFor,
  formatDisplayName,
  formatDto,
  formatLongName,
  isBucketName,
  slugifyArchetype,
} from '@/datasource/postgres/naming'
import type {
  DeckRow,
  EntryListRow,
  MatchupRow,
} from '@/datasource/postgres/sql'
import { isArchetypeSlug } from '@/lib/params'

// ---------------------------------------------------------------------------
// Pure helpers behind PostgresDataSource. None of these touch the DB client;
// importing them must not require TOURNAMENT_DATABASE_URL.
// ---------------------------------------------------------------------------

describe('matchupIndex / orientedPair', () => {
  const rows: MatchupRow[] = [
    { row_id: 'a', col_id: 'b', wins: 7, losses: 3, draws: 1 },
    { row_id: 'c', col_id: 'c', wins: 4, losses: 4, draws: 0 },
  ]
  const index = matchupIndex(rows)

  it('indexes rows by oriented row|col key', () => {
    expect(index.size).toBe(2)
    expect(index.get('a|b')).toEqual({ wins: 7, losses: 3, draws: 1 })
  })

  it('returns the forward record as stored', () => {
    expect(orientedPair(index, 'a', 'b')).toEqual({
      wins: 7,
      losses: 3,
      draws: 1,
    })
  })

  it('swaps W/L for the reverse orientation and keeps draws', () => {
    expect(orientedPair(index, 'b', 'a')).toEqual({
      wins: 3,
      losses: 7,
      draws: 1,
    })
  })

  it('returns a zero record on a miss (never undefined)', () => {
    expect(orientedPair(index, 'a', 'zzz')).toEqual(ZERO_REC)
    expect(orientedPair(index, 'zzz', 'a')).toEqual(ZERO_REC)
  })

  it('reads the mirror orientation for a === b, zero when absent', () => {
    expect(orientedPair(index, 'c', 'c')).toEqual({
      wins: 4,
      losses: 4,
      draws: 0,
    })
    expect(orientedPair(index, 'a', 'a')).toEqual(ZERO_REC)
  })

  it('does not mutate the index or the stored record on reverse lookups', () => {
    orientedPair(index, 'b', 'a')
    expect(index.get('a|b')).toEqual({ wins: 7, losses: 3, draws: 1 })
    expect(index.has('b|a')).toBe(false)
  })
})

describe('slugifyArchetype', () => {
  it('lowercases and hyphenates plain names', () => {
    expect(slugifyArchetype('Red Madness')).toBe('red-madness')
    expect(slugifyArchetype('broodscale')).toBe('broodscale')
  })

  it('collapses MTG "Name // Name" forms to one hyphen', () => {
    expect(slugifyArchetype('Aang // Katara')).toBe('aang-katara')
  })

  it('keeps a leading digit', () => {
    expect(slugifyArchetype('5 Color Aggro')).toBe('5-color-aggro')
  })

  it('collapses punctuation runs and strips edge hyphens', () => {
    expect(slugifyArchetype("Ragavan's, Nimble -- Pilferer!")).toBe(
      'ragavan-s-nimble-pilferer'
    )
    expect(slugifyArchetype('  --Mono Red--  ')).toBe('mono-red')
  })

  it('produces slugs the route guard accepts', () => {
    for (const name of ['Aang // Katara', '5 Color Aggro', "Ragavan's Deck"]) {
      expect(isArchetypeSlug(slugifyArchetype(name))).toBe(true)
    }
  })

  it('is a fixed point on every art-map key (sampled per format)', () => {
    const formats = artMap.formats as Record<string, Record<string, unknown>>
    for (const [format, bySlug] of Object.entries(formats)) {
      const keys = Object.keys(bySlug)
      expect(keys.length).toBeGreaterThan(0)
      // Every 7th key gives a spread across the alphabet, not just the head.
      const sample = keys.filter((_, i) => i % 7 === 0)
      for (const key of sample) {
        expect(slugifyArchetype(key), `${format}/${key}`).toBe(key)
        expect(isArchetypeSlug(key), `${format}/${key}`).toBe(true)
      }
    }
  })
})

describe('artFor', () => {
  it('finds art by the slugified archetype name and returns null otherwise', () => {
    const formats = artMap.formats as Record<
      string,
      Record<string, { cardName: string; artCropUrl: string | null }>
    >
    const [format, bySlug] = Object.entries(formats)[0]
    const [slug, entry] = Object.entries(bySlug)[0]
    // The display-cased name must map back onto the lowercase slug key.
    expect(
      artFor(format, archetypeDisplayName(slug.replace(/-/g, ' ')))
    ).toEqual(entry)
    expect(artFor(format, 'no such archetype ever')).toBeNull()
    expect(artFor('no-such-format', slug)).toBeNull()
  })
})

describe('archetypeDisplayName', () => {
  it('title-cases lowercase DB names per word', () => {
    expect(archetypeDisplayName('broodscale')).toBe('Broodscale')
    expect(archetypeDisplayName('red madness')).toBe('Red Madness')
  })

  it('preserves a leading digit', () => {
    expect(archetypeDisplayName('5 color aggro')).toBe('5 Color Aggro')
  })

  it('is idempotent', () => {
    expect(archetypeDisplayName('Red Madness')).toBe('Red Madness')
  })
})

describe('isBucketName', () => {
  it('flags the two classifier buckets case-insensitively', () => {
    expect(isBucketName('unknown')).toBe(true)
    expect(isBucketName('Conflict')).toBe(true)
    expect(isBucketName('unknown deck')).toBe(false)
  })
})

describe('format naming', () => {
  it('formatDisplayName: DC monogram for duel-commander, capitalized otherwise', () => {
    expect(formatDisplayName('duel-commander')).toBe('DC')
    expect(formatDisplayName('pauper')).toBe('Pauper')
  })

  it('formatLongName: hyphen-split title case', () => {
    expect(formatLongName('duel-commander')).toBe('Duel Commander')
    expect(formatLongName('modern')).toBe('Modern')
  })

  it('formatDto: name is the long form, displayName the monogram (types.ts)', () => {
    expect(formatDto('duel-commander')).toEqual({
      slug: 'duel-commander',
      name: 'Duel Commander',
      displayName: 'DC',
    })
    expect(formatDto('legacy')).toEqual({
      slug: 'legacy',
      name: 'Legacy',
      displayName: 'Legacy',
    })
  })
})

describe('isArchetypeSlug (route guard)', () => {
  it('accepts canonical slugs', () => {
    expect(isArchetypeSlug('broodscale')).toBe(true)
    expect(isArchetypeSlug('5-color-aggro')).toBe(true)
  })

  it('rejects casing variants, LIKE metacharacters, and edge hyphens', () => {
    for (const bad of [
      'Broodscale',
      'red%',
      'red_madness',
      '-red',
      'red-',
      'red--madness',
      'red madness',
      '',
      '../etc',
    ]) {
      expect(isArchetypeSlug(bad), bad).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Decklists mappers (plan U3) — raw Postgres rows → DTOs, no DB involved.
// ---------------------------------------------------------------------------

const entryRow: EntryListRow = {
  id: '0b8f2c1e-1234-4abc-9def-567890abcdef',
  entry_rank: 0,
  wins: 5,
  losses: 1,
  draws: 0,
  decklist_url: null,
  handle: 'playerone',
  tournament_id: 'tournament-1',
  tournament_name: 'Legacy Challenge 32',
  date: new Date(Date.UTC(2026, 8, 21, 18, 0, 0)),
  link: 'https://melee.gg/Tournament/View/123',
  source: 'MELEE',
  has_cards: true,
  total: 42,
}

describe('mapEntryListRows', () => {
  it('maps rank 0 to no rank and the event link as fallback source', () => {
    const dto = mapEntryListRows([entryRow])
    expect(dto.total).toBe(42)
    const e = dto.entries[0]
    expect(e.rank).toBeNull()
    expect(e.decklistUrl).toBeNull()
    expect(e.event.link).toBe('https://melee.gg/Tournament/View/123')
    expect(e.event.name).toBe('Legacy Challenge 32')
    expect(e.event.date).toBe('2026-09-21')
    expect(e.player).toBe('playerone')
    expect(e.hasCards).toBe(true)
  })

  it('keeps a nonzero MTGO rank and a published decklist URL', () => {
    const dto = mapEntryListRows([
      {
        ...entryRow,
        entry_rank: 3,
        decklist_url: 'https://www.mtgo.com/decklist/xyz',
        has_cards: false,
      },
    ])
    expect(dto.entries[0].rank).toBe(3)
    expect(dto.entries[0].decklistUrl).toBe('https://www.mtgo.com/decklist/xyz')
    expect(dto.entries[0].hasCards).toBe(false)
  })

  it('reports total 0 and no entries for an empty result', () => {
    expect(mapEntryListRows([])).toEqual({ total: 0, entries: [] })
  })
})

const deckHead: DeckRow = {
  id: 'entry-1',
  entry_rank: 1,
  wins: 7,
  losses: 0,
  draws: 1,
  decklist_url: 'https://www.mtgo.com/decklist/xyz',
  handle: 'playerone',
  tournament_id: 'tournament-1',
  tournament_name: 'Legacy Challenge 32',
  date: new Date(Date.UTC(2026, 8, 21, 18, 0, 0)),
  link: 'https://melee.gg/Tournament/View/123',
  source: 'MTGO',
  format_name: 'duel-commander',
  archetype_name: 'broodscale combo',
  archetype_color: 'BR',
  card_id: 'card-1',
  count: 4,
  board: 'MAIN',
  name: 'blade of the bloodchief',
  display_name: 'Blade of the Bloodchief',
  type_line: 'Creature — Vampire',
  mana_cost: '{B}{B}',
  cmc: 2,
  image_normal: 'https://cards.scryfall.io/normal/front/x.jpg',
  image_back: null,
  scryfall_uri: 'https://scryfall.com/card/xyz',
}

describe('mapDeckRows', () => {
  it('groups raw card rows into main and side, null data stays null', () => {
    const unbackfilled: DeckRow = {
      ...deckHead,
      card_id: 'card-2',
      count: 1,
      board: 'SIDE',
      name: 'soul-guide lantern',
      display_name: null,
      type_line: null,
      mana_cost: null,
      cmc: null,
      image_normal: null,
      image_back: null,
      scryfall_uri: null,
    }
    const deck = mapDeckRows([deckHead, unbackfilled])
    expect(deck).not.toBeNull()
    expect(deck!.format).toBe('duel-commander')
    expect(deck!.archetype.slug).toBe('broodscale-combo')
    expect(deck!.archetype.name).toBe('Broodscale Combo')
    expect(deck!.archetype.color).toBe('BR')
    expect(deck!.entry.rank).toBe(1)
    expect(deck!.entry.event.date).toBe('2026-09-21')
    expect(deck!.entry.hasCards).toBe(true)
    expect(deck!.main.map(c => c.cardId)).toEqual(['card-1'])
    expect(deck!.main[0]).toEqual({
      cardId: 'card-1',
      name: 'Blade of the Bloodchief',
      board: 'MAIN',
      count: 4,
      typeLine: 'Creature — Vampire',
      manaCost: '{B}{B}',
      cmc: 2,
      imageNormal: 'https://cards.scryfall.io/normal/front/x.jpg',
      imageBack: null,
      scryfallUri: 'https://scryfall.com/card/xyz',
    })
    // The unbackfilled card keeps the raw name and every KTD1 field null.
    expect(deck!.side[0]).toEqual({
      cardId: 'card-2',
      name: 'soul-guide lantern',
      board: 'SIDE',
      count: 1,
      typeLine: null,
      manaCost: null,
      cmc: null,
      imageNormal: null,
      imageBack: null,
      scryfallUri: null,
    })
  })

  it('maps a cardless entry to empty lists and hasCards false (R9)', () => {
    const padding: DeckRow = {
      ...deckHead,
      card_id: null,
      count: null,
      board: null,
      name: null,
      display_name: null,
      type_line: null,
      mana_cost: null,
      cmc: null,
      image_normal: null,
      image_back: null,
      scryfall_uri: null,
    }
    const deck = mapDeckRows([padding])
    expect(deck).not.toBeNull()
    expect(deck!.main).toEqual([])
    expect(deck!.side).toEqual([])
    expect(deck!.entry.hasCards).toBe(false)
  })

  it('returns null when the entry id matched no row', () => {
    expect(mapDeckRows([])).toBeNull()
  })
})

describe('cardDisplayName (KTD11)', () => {
  it('prefers the stored display_name', () => {
    expect(
      cardDisplayName('Blade of the Bloodchief', 'blade of the bloodchief')
    ).toBe('Blade of the Bloodchief')
  })

  it('falls back to the lowercase DB name', () => {
    expect(cardDisplayName(null, 'soul-guide lantern')).toBe(
      'soul-guide lantern'
    )
  })
})

describe('mapCardAdoptionRow (KTD11)', () => {
  const row = {
    card_id: 'c1',
    name: "Will-o'-the-Wisp",
    has_display_name: true,
    avg_count: 2.5,
    decks_playing: 3,
  }

  it('flags a stored display name so the renderer keeps its casing', () => {
    const dto = mapCardAdoptionRow(row, 'MAIN', 12)
    expect(dto).toEqual({
      cardId: 'c1',
      name: "Will-o'-the-Wisp",
      hasDisplayName: true,
      board: 'MAIN',
      avgCount: 2.5,
      decksPlaying: 3,
      presencePct: 0.25,
    })
  })

  it('marks the lowercase fallback for title-casing', () => {
    const dto = mapCardAdoptionRow(
      { ...row, name: 'soul-guide lantern', has_display_name: false },
      'SIDE',
      12
    )
    expect(dto.hasDisplayName).toBe(false)
    expect(dto.name).toBe('soul-guide lantern')
  })

  it('reports zero presence when the archetype has no decks', () => {
    expect(mapCardAdoptionRow(row, 'MAIN', 0).presencePct).toBe(0)
  })
})
