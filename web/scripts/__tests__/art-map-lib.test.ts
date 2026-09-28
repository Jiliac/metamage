import { describe, expect, it } from 'vitest'
import {
  type CandidateRow,
  DEFAULT_REPORT_FORMATS,
  MAX_RETRY_WAIT_MS,
  type Signature,
  buildArtMapFormats,
  cardsToFetch,
  collectionIdentifiers,
  extractArtCrop,
  matchArtCrops,
  networkBackoffMs,
  parseCandidateRows,
  parseCliArgs,
  parseOverrides,
  parsePreviousMap,
  parseReportArg,
  pickSignatures,
  rateLimitDelayMs,
  resolvePreviousMap,
  seedFromPreviousMap,
  serializeArtMap,
} from '../art-map-lib'

const ART = (id: string) =>
  `https://cards.scryfall.io/art_crop/front/a/b/${id}.jpg?1`

const row = (
  format: string,
  arch: string,
  card: string,
  decks: number,
  fmtCardDecks: number,
  extra: Partial<CandidateRow> = {}
): CandidateRow => ({
  format_name: format,
  arch_name: arch,
  card_name: card,
  is_land: false,
  decks,
  copies: decks * 4,
  arch_decks: 100,
  fmt_card_decks: fmtCardDecks,
  fmt_decks: 1000,
  recent_90: 10,
  ...extra,
})

const sig = (
  formatName: string,
  archName: string,
  cardName: string,
  archDecks = 100
): Signature => ({
  formatName,
  archName,
  cardName,
  archDecks,
  recent90: 0,
  overridden: false,
})

describe('parseOverrides', () => {
  it('skips _comment keys and lower-cases archetype keys', () => {
    const overrides = parseOverrides({
      _comment: 'ignored',
      modern: { Prowess: 'monastery swiftspear' },
    })
    expect(overrides).toEqual({
      modern: { prowess: 'monastery swiftspear' },
    })
  })

  it('rejects non-string and empty card names', () => {
    expect(() => parseOverrides({ modern: { prowess: 42 } })).toThrow(
      /overrides\.modern\["prowess"\].*non-empty card name/
    )
    expect(() => parseOverrides({ modern: { prowess: ' ' } })).toThrow(
      /non-empty/
    )
  })

  it('rejects a wrong top-level or format shape', () => {
    expect(() => parseOverrides(['modern'])).toThrow(/JSON object/)
    expect(() => parseOverrides({ modern: 'x' })).toThrow(/overrides\.modern/)
  })

  it('rejects keys that collide once lower-cased', () => {
    expect(() =>
      parseOverrides({ modern: { Prowess: 'a', prowess: 'b' } })
    ).toThrow(/duplicates/)
  })
})

describe('pickSignatures', () => {
  const rows = [
    row('modern', 'Prowess', 'lightning bolt', 100, 500),
    row('modern', 'Prowess', 'monastery swiftspear', 98, 110),
    row('modern', 'Tron', 'expedition map', 99, 110),
  ]

  it('applies the heuristic when there is no override', () => {
    const { signatures } = pickSignatures(rows, {})
    expect(signatures.map(s => [s.archName, s.cardName])).toEqual([
      ['Prowess', 'monastery swiftspear'],
      ['Tron', 'expedition map'],
    ])
  })

  it('matches override keys case-insensitively and keeps the DB spelling', () => {
    const overrides = parseOverrides({
      modern: { PROWESS: 'Lightning Bolt' },
    })
    const pick = pickSignatures(rows, overrides)
    const prowess = pick.signatures.find(s => s.archName === 'Prowess')
    expect(prowess).toMatchObject({
      cardName: 'lightning bolt',
      overridden: true,
    })
    expect(pick.unusedOverrides).toEqual([])
    expect(pick.mismatchedOverrides).toEqual([])
  })

  it('reports unused overrides', () => {
    const pick = pickSignatures(rows, {
      modern: { 'no such deck': 'x' },
      vintage: { oath: 'oath of druids' },
    })
    expect(pick.unusedOverrides).toEqual([
      'modern/no such deck',
      'vintage/oath',
    ])
  })

  it('reports an override card that is not among the candidates', () => {
    const pick = pickSignatures(rows, {
      modern: { tron: 'expedtion map' },
    })
    expect(pick.mismatchedOverrides).toEqual([
      { format: 'modern', archetype: 'tron', cardName: 'expedtion map' },
    ])
    // still applied, so the problem is visible in the output too
    expect(pick.signatures.find(s => s.archName === 'Tron')?.cardName).toBe(
      'expedtion map'
    )
  })

  it('returns signatures in a stable order regardless of row order', () => {
    const a = pickSignatures(rows, {}).signatures
    const b = pickSignatures([...rows].reverse(), {}).signatures
    expect(b).toEqual(a)
  })
})

describe('parseCandidateRows', () => {
  it('accepts well-formed rows and rejects drifted ones', () => {
    const good = row('modern', 'Tron', 'expedition map', 99, 110)
    expect(parseCandidateRows([good])).toEqual([good])
    expect(() => parseCandidateRows([good, { ...good, decks: '99' }])).toThrow(
      /index 1/
    )
  })
})

describe('cardsToFetch', () => {
  it('dedupes by lower-case and skips known names', () => {
    const { distinct, toFetch } = cardsToFetch(
      [
        sig('modern', 'A', 'Card One'),
        sig('legacy', 'B', 'card one'),
        sig('legacy', 'C', 'Card Two'),
      ],
      new Map([['card two', 'x']])
    )
    expect(distinct).toBe(2)
    expect(toFetch).toEqual(['card one'])
  })
})

describe('extractArtCrop', () => {
  it('uses image_uris for a single-faced card', () => {
    expect(extractArtCrop({ image_uris: { art_crop: ART('a') } })).toBe(
      ART('a')
    )
  })

  it('uses the front face for a double-faced card', () => {
    expect(
      extractArtCrop({
        card_faces: [
          { image_uris: { art_crop: ART('front') } },
          { image_uris: { art_crop: ART('back') } },
        ],
      })
    ).toBe(ART('front'))
  })

  it('rejects the wrong host, non-https URLs and garbage', () => {
    expect(
      extractArtCrop({ image_uris: { art_crop: 'https://evil.example/x.jpg' } })
    ).toBeNull()
    expect(
      extractArtCrop({
        image_uris: { art_crop: 'http://cards.scryfall.io/art_crop/x.jpg' },
      })
    ).toBeNull()
    expect(
      extractArtCrop({
        image_uris: {
          art_crop: 'https://cards.scryfall.io.evil.example/x.jpg',
        },
      })
    ).toBeNull()
    expect(extractArtCrop({ image_uris: { art_crop: 'not a url' } })).toBeNull()
    expect(extractArtCrop({})).toBeNull()
  })
})

describe('matchArtCrops', () => {
  it('matches double-faced cards by front face and nulls the rest', () => {
    const requested = [
      'Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar',
      'Monastery Swiftspear',
      'Not Returned',
    ]
    expect(collectionIdentifiers(requested)).toEqual([
      { name: 'Tamiyo, Inquisitive Student' },
      { name: 'Monastery Swiftspear' },
      { name: 'Not Returned' },
    ])
    const art = matchArtCrops(requested, [
      {
        name: 'Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar',
        card_faces: [{ image_uris: { art_crop: ART('tamiyo') } }],
      },
      { name: 'Monastery Swiftspear', image_uris: { art_crop: ART('mss') } },
      { name: 'Unrequested Card', image_uris: { art_crop: ART('other') } },
    ])
    expect([...art]).toEqual([
      [
        'tamiyo, inquisitive student // tamiyo, seasoned scholar',
        ART('tamiyo'),
      ],
      ['monastery swiftspear', ART('mss')],
      ['not returned', null],
    ])
  })
})

describe('retry delays', () => {
  it('honours Retry-After, defaults to 61s, caps at the maximum', () => {
    expect(rateLimitDelayMs('5')).toBe(5000)
    expect(rateLimitDelayMs(null)).toBe(61_000)
    expect(rateLimitDelayMs('soon')).toBe(61_000)
    expect(rateLimitDelayMs('3600')).toBe(MAX_RETRY_WAIT_MS)
  })

  it('backs off exponentially and caps', () => {
    expect(networkBackoffMs(0)).toBe(2000)
    expect(networkBackoffMs(2)).toBe(8000)
    expect(networkBackoffMs(20)).toBe(MAX_RETRY_WAIT_MS)
  })
})

describe('parseReportArg / parseCliArgs', () => {
  it('parses a valid list, trimming and dropping duplicates', () => {
    expect(parseReportArg('vintage, duel-commander,vintage')).toEqual({
      ok: true,
      value: ['vintage', 'duel-commander'],
    })
  })

  it('rejects an empty list or empty entry', () => {
    expect(parseReportArg('').ok).toBe(false)
    expect(parseReportArg('modern,,legacy').ok).toBe(false)
  })

  it('rejects unknown formats and lists the valid ones', () => {
    const result = parseReportArg('modern,modrn')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('modrn')
      expect(result.error).toContain('valid: modern')
    }
  })

  it('defaults the report formats and reads the flags', () => {
    expect(parseCliArgs(['--fill-gaps', '--strict'])).toEqual({
      ok: true,
      value: {
        help: false,
        fillGaps: true,
        dryRun: false,
        strict: true,
        reportFormats: DEFAULT_REPORT_FORMATS,
      },
    })
    expect(parseCliArgs(['-h'])).toMatchObject({
      ok: true,
      value: { help: true },
    })
  })

  it('rejects --report= (empty), a repeated --report and unknown args', () => {
    expect(parseCliArgs(['--report=']).ok).toBe(false)
    const repeated = parseCliArgs(['--report=modern', '--report=legacy'])
    expect(repeated).toEqual({
      ok: false,
      error: '--report= may be given at most once',
    })
    expect(parseCliArgs(['--dryrun'])).toEqual({
      ok: false,
      error: 'unknown argument(s): --dryrun',
    })
  })
})

describe('previous map handling', () => {
  it('throws on merge-conflict markers', () => {
    expect(() =>
      parsePreviousMap('<<<<<<< HEAD\n{"formats":{}}\n>>>>>>> x\n')
    ).toThrow()
  })

  it('degrades to a warning outside --fill-gaps and in a fill-gaps dry run', () => {
    const read = { ok: false as const, reason: 'broken' }
    expect(
      resolvePreviousMap(read, { fillGaps: false, dryRun: false })
    ).toEqual({ previous: null, warning: expect.stringContaining('broken') })
    expect(resolvePreviousMap(read, { fillGaps: true, dryRun: true })).toEqual({
      previous: null,
      warning: expect.stringContaining('empty seed'),
    })
    expect(() =>
      resolvePreviousMap(read, { fillGaps: true, dryRun: false })
    ).toThrow(/--fill-gaps requires a readable art map: broken/)
  })

  it('seeds valid entries and skips malformed ones without throwing', () => {
    const previous = parsePreviousMap(
      JSON.stringify({
        formats: {
          modern: {
            prowess: { cardName: 'Monastery Swiftspear', artCropUrl: ART('m') },
            tron: { cardName: 'expedition map', artCropUrl: null },
            broken: { artCropUrl: ART('x') },
            offsite: { cardName: 'x', artCropUrl: 'https://evil.example/x' },
          },
        },
      })
    )
    const { seed, skipped } = seedFromPreviousMap(previous)
    expect([...seed]).toEqual([['monastery swiftspear', ART('m')]])
    expect(skipped).toEqual(['modern/broken'])
  })
})

describe('buildArtMapFormats / serializeArtMap', () => {
  const art = new Map<string, string | null>([['card a', ART('a')]])

  it('resolves slug collisions by deck count, then name, in any order', () => {
    const signatures = [
      sig('modern', 'Mono Red', 'card a', 50),
      sig('modern', 'Mono-Red', 'card b', 80),
    ]
    const forward = buildArtMapFormats(signatures, art)
    const backward = buildArtMapFormats([...signatures].reverse(), art)
    expect(forward).toEqual(backward)
    expect(forward.formats.modern['mono-red'].cardName).toBe('card b')
    expect(forward.collisions).toEqual([
      {
        format: 'modern',
        slug: 'mono-red',
        kept: 'Mono-Red',
        dropped: ['Mono Red'],
      },
    ])

    const tie = buildArtMapFormats(
      [
        sig('modern', 'Mono-Red', 'card b'),
        sig('modern', 'Mono Red', 'card a'),
      ],
      art
    )
    expect(tie.formats.modern['mono-red']).toEqual({
      cardName: 'card a',
      artCropUrl: ART('a'),
    })
  })

  it('serialises formats and slugs in sorted order', () => {
    const { formats } = buildArtMapFormats(
      [
        sig('pauper', 'Zoo', 'card z'),
        sig('legacy', 'Sneak and Show', 'card s'),
        sig('pauper', 'Affinity', 'card a'),
      ],
      art
    )
    const text = serializeArtMap({ generatedAt: 'T', formats })
    const parsed = JSON.parse(text) as {
      formats: Record<string, Record<string, unknown>>
    }
    expect(Object.keys(parsed.formats)).toEqual(['legacy', 'pauper'])
    expect(Object.keys(parsed.formats.pauper)).toEqual(['affinity', 'zoo'])
    expect(text.endsWith('}\n')).toBe(true)
  })
})
