import { describe, expect, it } from 'vitest'

import artMap from '@/datasource/art-map.json'
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
import type { MatchupRow } from '@/datasource/postgres/sql'
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
