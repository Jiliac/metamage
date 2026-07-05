/*
 * gen-fixtures.specs.ts — the per-format seed data behind gen-fixtures.ts.
 *
 * Pure data + tiny constructors, no generation logic: the archetype spec lists
 * per format, the fixed Standard June-2026 matchup matrix (mirroring the design
 * spike / blueprint §9), and the seeded meta-change events. Split out of
 * gen-fixtures.ts so the generator file stays within the size guideline and the
 * "what" (this file) reads separately from the "how" (the generator).
 */
import seedrandom from 'seedrandom'
import type { MetaChangeDTO } from '../src/datasource/types'
import type { RawMatchup } from '../src/datasource/fixtures'

type Rng = () => number

export type Spec = {
  slug: string
  name: string
  color: string | null
  matches: number
  wr: number // percent, decisive-game win rate
  share?: number // informational only (the read-time denom recomputes it)
  isBucket?: boolean
  card?: string // signature card (art) — Standard only
  drawsPct?: number
  gapWeek?: boolean // force one zero-game trend week (null-WR gap demo)
}

// ---------------------------------------------------------------------------
// STANDARD — real June 2026 numbers, exactly mirroring the design spike (§9)
// ---------------------------------------------------------------------------

export const STANDARD_SPECS: Spec[] = [
  { slug: 'selesnya-ouroboroid', name: 'Selesnya Ouroboroid', color: 'GW', share: 17.7, wr: 50.9, matches: 757, card: 'Badgermole Cub' }, // prettier-ignore
  { slug: 'izzet-prowess', name: 'Izzet Prowess', color: 'UR', share: 17.2, wr: 48.6, matches: 735, card: 'Slickshot Show-Off' }, // prettier-ignore
  { slug: 'jeskai-lessons', name: 'Jeskai Lessons', color: 'URW', share: 12.3, wr: 52.6, matches: 527, card: 'Tablet of Discovery' }, // prettier-ignore
  { slug: 'izzet-spellementals', name: 'Izzet Spellementals', color: 'UR', share: 10.1, wr: 53.1, matches: 433, card: 'Eddymurk Crab' }, // prettier-ignore
  { slug: 'jeskai-control', name: 'Jeskai Control', color: 'URW', share: 7.6, wr: 48.2, matches: 326, card: 'Inevitable Defeat' }, // prettier-ignore
  { slug: 'dimir-excruciator', name: 'Dimir Excruciator', color: 'UB', share: 6.5, wr: 48.2, matches: 276, card: 'Deceit' }, // prettier-ignore
  { slug: 'mono-green-landfall', name: 'Mono Green Landfall', color: 'G', share: 4.0, wr: 52.9, matches: 172, card: 'Icetill Explorer' }, // prettier-ignore
  { slug: 'azorius-momo', name: 'Azorius Momo', color: 'WU', share: 3.8, wr: 45.1, matches: 162, card: 'Momo Friendly Flier' }, // prettier-ignore
  { slug: 'selesnya-aggro', name: 'Selesnya Aggro', color: 'GW', share: 2.7, wr: 48.7, matches: 115, card: 'Mightform Harmonizer' }, // prettier-ignore
  { slug: 'selesnya-landfall', name: 'Selesnya Landfall', color: 'GW', share: 2.2, wr: 62.5, matches: 96, card: 'Felidar Retreat', gapWeek: true }, // prettier-ignore
  { slug: 'izzet-lessons', name: 'Izzet Lessons', color: 'UR', share: 1.5, wr: 55.4, matches: 64, card: 'Divide by Zero' }, // prettier-ignore
  { slug: 'mardu-discard', name: 'Mardu Discard', color: 'WBR', share: 1.3, wr: 41.0, matches: 55, card: 'Rite of Oblivion' }, // prettier-ignore
  { slug: 'izzet-midrange', name: 'Izzet Midrange', color: 'UR', share: 1.2, wr: 48.3, matches: 51, card: 'Ledger Shredder' }, // prettier-ignore
  { slug: 'izzet-aggro', name: 'Izzet Aggro', color: 'UR', share: 0.8, wr: 41.0, matches: 34, card: 'Kiln Fiend' }, // prettier-ignore
  { slug: 'unknown', name: 'Unknown', color: null, share: 2.4, wr: 47.0, matches: 103, isBucket: true }, // prettier-ignore
  { slug: 'conflict', name: 'Conflict', color: null, share: 0.7, wr: 49.0, matches: 30, isBucket: true }, // prettier-ignore
]

// Spike matchup matrix (top-10, row beats column). null = no data → omitted.
const STANDARD_M: (readonly [number, number] | null)[][] = [
  [null, [74, 69], [62, 45], [24, 45], [24, 28], [20, 25], [22, 15], [11, 13], [12, 7], [11, 6]], // prettier-ignore
  [[69, 74], null, [38, 58], [38, 32], [19, 26], [26, 17], [11, 15], [17, 14], [13, 12], [2, 6]], // prettier-ignore
  [[45, 62], [58, 38], null, [25, 21], [24, 14], [18, 18], [9, 9], [10, 8], [4, 8], [7, 10]], // prettier-ignore
  [[45, 24], [32, 38], [21, 25], null, [15, 21], [11, 11], [6, 5], [13, 6], [10, 6], [4, 3]], // prettier-ignore
  [[28, 24], [26, 19], [14, 24], [21, 15], null, [11, 12], [3, 16], [5, 4], [7, 2], [2, 6]], // prettier-ignore
  [[25, 20], [17, 26], [18, 18], [11, 11], [12, 11], null, [9, 6], [8, 4], [3, 3], [1, 7]], // prettier-ignore
  [[15, 22], [15, 11], [9, 9], [5, 6], [16, 3], [6, 9], null, [3, 5], null, [3, 4]], // prettier-ignore
  [[13, 11], [14, 17], [8, 10], [6, 13], [4, 5], [4, 8], [5, 3], null, [2, 4], [2, 3]], // prettier-ignore
  [[7, 12], [12, 13], [8, 4], [6, 10], [2, 7], [3, 3], null, [4, 2], null, null], // prettier-ignore
  [[6, 11], [6, 2], [10, 7], [3, 4], [6, 2], [7, 1], [4, 3], [3, 2], null, null], // prettier-ignore
]

export function standardFixedMatchups(): RawMatchup[] {
  const out: RawMatchup[] = []
  for (let r = 0; r < STANDARD_M.length; r++) {
    for (let c = r + 1; c < STANDARD_M[r].length; c++) {
      const rec = STANDARD_M[r][c]
      if (!rec) continue
      out.push({
        a: STANDARD_SPECS[r].slug,
        b: STANDARD_SPECS[c].slug,
        w: rec[0],
        l: rec[1],
        d: 0,
      })
    }
  }
  return out
}

// Prior-month (May) variant: same field, scaled + jittered, thinner tail.
export function scaleSpecs(
  specs: Spec[],
  factor: number,
  seed: string
): Spec[] {
  const rng = seedrandom(seed) as unknown as Rng
  return specs
    .filter(s => !['izzet-midrange', 'izzet-aggro'].includes(s.slug))
    .map(s => ({
      ...s,
      matches: Math.max(8, Math.round(s.matches * factor)),
      wr: Math.min(70, Math.max(30, s.wr + (rng() - 0.5) * 3)),
    }))
}

// ---------------------------------------------------------------------------
// Synthesized non-Standard formats
// ---------------------------------------------------------------------------

function spec(
  slug: string,
  name: string,
  color: string | null,
  matches: number,
  wr: number,
  opts: Partial<Spec> = {}
): Spec {
  return { slug, name, color, matches, wr, drawsPct: 0.015, ...opts }
}

export function pauperSpecs(withNayaSpike: boolean): Spec[] {
  const base: Spec[] = [
    spec('mono-red-kuldotha', 'Mono Red Kuldotha', 'R', 612, 51.8),
    spec('grixis-affinity', 'Grixis Affinity', 'UBR', 548, 50.4),
    spec('dimir-faeries', 'Dimir Faeries', 'UB', 470, 52.1),
    spec('boros-synthesizer', 'Boros Synthesizer', 'WR', 388, 49.2),
    spec('gruul-ramp', 'Gruul Ramp', 'RG', 331, 48.0),
    spec('azorius-familiars', 'Azorius Familiars', 'WU', 268, 53.5),
    spec('mono-black-control', 'Mono Black Control', 'B', 233, 47.6),
    spec('golgari-gardens', 'Golgari Gardens', 'BG', 190, 50.1),
    spec('elves', 'Elves', 'G', 141, 49.4),
    spec('burn', 'Burn', 'R', 118, 46.8),
    spec('tolarian-terror', 'Tolarian Terror', 'U', 92, 51.2, {
      gapWeek: true,
    }),
    spec('bogles', 'Bogles', 'GW', 61, 54.0),
    spec('unknown', 'Unknown', null, 138, 47.5, { isBucket: true }),
    spec('conflict', 'Conflict', null, 44, 49.5, { isBucket: true }),
  ]
  if (withNayaSpike) {
    base.splice(6, 0, spec('naya-gates', 'Naya Gates', 'WRG', 214, 57.3))
  }
  return base
}

export function pioneerSpecs(withLessons: boolean): Spec[] {
  const base: Spec[] = [
    spec('izzet-phoenix', 'Izzet Phoenix', 'UR', 588, 52.4),
    spec('rakdos-midrange', 'Rakdos Midrange', 'BR', 542, 50.9),
    spec('azorius-control', 'Azorius Control', 'WU', 415, 51.6),
    spec('mono-green-devotion', 'Mono Green Devotion', 'G', 372, 49.1),
    spec('lotus-field-combo', 'Lotus Field Combo', 'U', 268, 53.8),
    spec('boros-convoke', 'Boros Convoke', 'WR', 244, 48.3),
    spec('gruul-aggro', 'Gruul Aggro', 'RG', 197, 47.9),
    spec('amalia-combo', 'Amalia Combo', 'WBG', 152, 51.0),
    spec('spirits', 'Spirits', 'WU', 108, 49.7, { gapWeek: true }),
    spec('lotleth-titan', 'Lotleth Titan', 'BG', 74, 46.2),
    spec('unknown', 'Unknown', null, 176, 48.0, { isBucket: true }),
    spec('conflict', 'Conflict', null, 51, 49.0, { isBucket: true }),
  ]
  if (withLessons) {
    base.splice(3, 0, spec('izzet-lessons', 'Izzet Lessons', 'UR', 358, 54.6))
  }
  return base
}

export function modernSpecs(): Spec[] {
  return [
    spec('boros-energy', 'Boros Energy', 'WR', 704, 52.9),
    spec('izzet-murktide', 'Izzet Murktide', 'UR', 512, 50.2),
    spec('amulet-titan', 'Amulet Titan', 'G', 388, 51.8),
    spec('living-end', 'Living End', 'BRG', 316, 49.5),
    spec('rakdos-scam', 'Rakdos Scam', 'BR', 297, 48.7),
    spec('yawgmoth', 'Golgari Yawgmoth', 'BG', 254, 50.6),
    spec('tron', 'Mono Green Tron', 'G', 216, 47.9),
    spec('domain-zoo', 'Domain Zoo', 'WBRG', 168, 49.0),
    spec('hammer-time', 'Hammer Time', 'W', 131, 48.2),
    spec('dimir-control', 'Dimir Control', 'UB', 94, 51.5, { gapWeek: true }),
    spec('unknown', 'Unknown', null, 201, 47.8, { isBucket: true }),
    spec('conflict', 'Conflict', null, 58, 49.2, { isBucket: true }),
  ]
}

export function legacySpecs(): Spec[] {
  return [
    spec('izzet-delver', 'Izzet Delver', 'UR', 486, 52.2),
    spec('reanimator', 'Reanimator', 'BR', 352, 51.0),
    spec('lands', 'Lands', 'RG', 288, 50.4),
    spec('death-and-taxes', 'Death & Taxes', 'W', 241, 48.9),
    spec('sneak-and-show', 'Sneak & Show', 'UR', 205, 51.7),
    spec('eight-cast', '8-Cast', 'U', 166, 49.3),
    spec('doomsday', 'Doomsday', 'UB', 121, 50.8, { gapWeek: true }),
    spec('elves', 'Elves', 'G', 88, 48.1),
    spec('painter', 'Painter', 'R', 57, 47.0),
    spec('unknown', 'Unknown', null, 149, 48.0, { isBucket: true }),
    spec('conflict', 'Conflict', null, 40, 49.0, { isBucket: true }),
  ]
}

export function vintageSpecs(): Spec[] {
  return [
    spec('ragavan-shops', 'Ragavan Shops', 'R', 214, 52.6),
    spec('jeskai-xerox', 'Jeskai Xerox', 'URW', 188, 51.1),
    spec('oath', 'Oath of Druids', 'UG', 142, 50.2),
    spec('dredge', 'Dredge', 'BR', 118, 49.4),
    spec('doomsday', 'Doomsday', 'UB', 96, 52.0),
    spec('po-storm', 'Paradoxical Storm', 'U', 71, 50.9, { gapWeek: true }),
    spec('bazaar-aggro', 'Bazaar Aggro', 'BR', 44, 48.0),
    spec('unknown', 'Unknown', null, 83, 47.5, { isBucket: true }),
    spec('conflict', 'Conflict', null, 26, 49.0, { isBucket: true }),
  ]
}

export function duelCommanderSpecs(): Spec[] {
  return [
    spec('najeela', 'Najeela', 'WUBRG', 96, 53.0),
    spec('kenrith', 'Kenrith', 'WUBRG', 82, 51.2),
    spec('thrasios-tymna', 'Thrasios / Tymna', 'WUBG', 74, 52.4),
    spec('krark-sakashima', 'Krark / Sakashima', 'UR', 61, 50.0),
    spec('marwar', 'Marwar', 'BR', 48, 48.6),
    spec('tivit', 'Tivit', 'WUB', 37, 49.5, { gapWeek: true }),
    spec('unknown', 'Unknown', null, 44, 47.0, { isBucket: true }),
    spec('conflict', 'Conflict', null, 18, 49.0, { isBucket: true }),
  ]
}

/** Sum the match participations across specs → the share denominator, padded
 *  with a residual "other" tail so `other` is always non-null in the report. */
export function kpiFromSpecs(
  specs: Spec[],
  otherFraction: number
): {
  matches: number
  entries: number
  tournaments: number
} {
  const listed = specs.reduce((s, a) => s + a.matches, 0)
  const matches = Math.round(listed / (1 - otherFraction))
  const entries = Math.round(matches * 0.244)
  const tournaments = Math.max(6, Math.round(entries / 20))
  return { matches, entries, tournaments }
}

// ---------------------------------------------------------------------------
// Meta changes (seeded from repo memory)
// ---------------------------------------------------------------------------

export const CHANGES: Record<string, MetaChangeDTO[]> = {
  standard: [
    { date: '2026-06-06' as MetaChangeDTO['date'], type: 'SET_RELEASE', description: 'Set release: new Standard-legal expansion', setCode: 'TDM' }, // prettier-ignore
  ],
  pauper: [
    { date: '2026-06-29' as MetaChangeDTO['date'], type: 'BAN', description: 'Seeker of Skybreak banned in Pauper — Naya Gates combo splits out of the gates bucket' }, // prettier-ignore
  ],
  pioneer: [
    { date: '2026-05-18' as MetaChangeDTO['date'], type: 'BAN', description: 'Cori-Steel Cutter banned in Pioneer — Izzet Lessons emerges from the Prowess/Control shells' }, // prettier-ignore
  ],
  modern: [],
  legacy: [],
  vintage: [],
  'duel-commander': [],
}
