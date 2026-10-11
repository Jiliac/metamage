import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIXTURE_DB_PATH, fixtureDb } from '@/datasource/fixtures'
import type { RawArchetype, RawDb } from '@/datasource/fixtures'
import {
  FIXTURE_MAX_LINES,
  decodeDbJsonl,
  encodeDbJsonl,
} from '@/datasource/fixtures-jsonl'

// ---------------------------------------------------------------------------
// The committed fixture DB is JSONL with a hard line cap, and the codec is an
// exact round trip — so the generator's output and the runtime read agree.
// ---------------------------------------------------------------------------

function arch(slug: string): RawArchetype {
  return {
    slug,
    name: slug,
    color: null,
    isBucket: false,
    art: null,
    decks: 1,
    players: [{ p: `${slug}-p1`, w: 1, l: 0, d: 0 }],
    mainCards: [],
    sideCards: [],
    trend: [],
    entries: [],
    deckLists: [],
  }
}

const tiny: RawDb = {
  generatedAt: '2026-07-05T00:00:00.000Z',
  cardData: {
    'lightning bolt': {
      displayName: 'Lightning Bolt',
      typeLine: 'Instant',
      manaCost: '{R}',
      cmc: 1,
      imageNormal: null,
      imageBack: null,
      scryfallUri: null,
    },
  },
  formats: [
    {
      slug: 'modern',
      name: 'Modern',
      displayName: 'Modern',
      metaChanges: [],
      windows: [
        {
          start: '2026-06-01',
          end: '2026-06-30',
          kpis: { tournaments: 1, entries: 2, matches: 1 },
          archetypes: [arch('burn'), arch('tron')],
          matchups: [],
          tournaments: [],
        },
        {
          start: '2026-07-01',
          end: '2026-07-31',
          kpis: { tournaments: 0, entries: 0, matches: 0 },
          archetypes: [],
          matchups: [],
          tournaments: [],
        },
      ],
    },
    {
      slug: 'legacy',
      name: 'Legacy',
      displayName: 'Legacy',
      metaChanges: [],
      aliases: { old: 'new' },
      windows: [],
    },
  ],
}

describe('fixture JSONL codec', () => {
  it('round-trips a DB exactly, one record per line', () => {
    const text = encodeDbJsonl(tiny)
    expect(text.endsWith('\n')).toBe(true)
    // meta + 1 card + 2 formats + 2 windows + 2 archetypes
    expect(text.split('\n')).toHaveLength(8 + 1)
    expect(decodeDbJsonl(text)).toEqual(tiny)
  })

  it('rejects an archetype line whose window is not the current one', () => {
    const lines = encodeDbJsonl(tiny).trimEnd().split('\n')
    // Move the first archetype after the July window line.
    const reordered = [lines[0], lines[1], lines[2], lines[5], lines[3]]
    expect(() => decodeDbJsonl(reordered.join('\n'))).toThrow(
      /unknown window modern 2026-06-01_2026-06-30/
    )
  })

  it('rejects a window line before its format', () => {
    const lines = encodeDbJsonl(tiny).trimEnd().split('\n')
    expect(() => decodeDbJsonl([lines[0], lines[3]].join('\n'))).toThrow(
      /unknown format 'modern'/
    )
  })
})

describe('committed fixture DB', () => {
  const text = readFileSync(join(process.cwd(), FIXTURE_DB_PATH), 'utf8')

  it(`stays within ${FIXTURE_MAX_LINES} lines`, () => {
    expect(text.split('\n').length - 1).toBeLessThanOrEqual(FIXTURE_MAX_LINES)
  })

  it('is the canonical encoding of what the loader decodes', () => {
    expect(encodeDbJsonl(fixtureDb())).toBe(text)
  })
})
