import type { RawFormat, RawWindow } from '../../src/datasource/fixtures'
import {
  CHANGES,
  duelCommanderSpecs,
  kpiFromSpecs,
  legacySpecs,
  modernSpecs,
  pauperSpecs,
  pioneerSpecs,
  scaleSpecs,
  STANDARD_SPECS,
  standardFixedMatchups,
  vintageSpecs,
  type Spec,
} from '../gen-fixtures.specs'
import type { ArtRef } from './archetypes'
import { pad2 } from './helpers'
import { EMPTY_ART } from './scryfall'
import { buildWindow, emptyWindow } from './windows'

// ---------------------------------------------------------------------------
// STANDARD (showcase)
// ---------------------------------------------------------------------------

/** The June showcase KPIs, reused by July. */
const STANDARD_SHOWCASE_KPIS = {
  kpiTournaments: 58,
  kpiEntries: 1042,
  kpiMatches: 4277,
}

function buildStandardFormat(standardArt: Map<string, ArtRef>): RawFormat {
  const standardFixed = standardFixedMatchups()

  const base = {
    y: 2026,
    artBySlug: standardArt,
    formatName: 'Standard',
    matrixTopN: 12,
  }
  const showcase = {
    ...STANDARD_SHOWCASE_KPIS,
    specs: STANDARD_SPECS,
    fixedMatchups: standardFixed,
  }
  const stdJune = buildWindow({
    ...base,
    ...showcase,
    mZero: 5,
    seed: 'standard-2026-06',
  })
  // July = the current-month default landing; reuse the showcase numbers.
  const stdJuly = buildWindow({
    ...base,
    ...showcase,
    mZero: 6,
    seed: 'standard-2026-07',
  })
  const stdMaySpecs = scaleSpecs(STANDARD_SPECS, 0.9, 'standard-may-scale')
  const stdMay = buildWindow({
    ...base,
    mZero: 4,
    specs: stdMaySpecs,
    kpiTournaments: 51,
    kpiEntries: 921,
    kpiMatches: 3782,
    seed: 'standard-2026-05',
  })

  return {
    slug: 'standard',
    name: 'Standard',
    displayName: 'Standard',
    metaChanges: CHANGES.standard,
    aliases: { 'selesnya-cub': 'selesnya-ouroboroid' },
    windows: [stdMay, stdJune, stdJuly, emptyWindow(2026, 7)],
  }
}

// ---------------------------------------------------------------------------
// Synthesized formats
// ---------------------------------------------------------------------------

type SynthDef = {
  slug: string
  name: string
  displayName: string
  formatName: string
  monthSpecs: (mZero: number) => Spec[]
  months: number[]
}

const SYNTH_DEFS: SynthDef[] = [
  {
    slug: 'pauper',
    name: 'Pauper',
    displayName: 'Pauper',
    formatName: 'Pauper',
    months: [4, 5, 6],
    // Naya Gates spike appears only after the Jun 29 Seeker ban (July window).
    monthSpecs: mZero => pauperSpecs(mZero >= 6),
  },
  {
    slug: 'pioneer',
    name: 'Pioneer',
    displayName: 'Pioneer',
    formatName: 'Pioneer',
    months: [4, 5, 6],
    // Izzet Lessons emerges after the May 18 Cori-Steel ban (June onward).
    monthSpecs: mZero => pioneerSpecs(mZero >= 5),
  },
  {
    slug: 'modern',
    name: 'Modern',
    displayName: 'Modern',
    formatName: 'Modern',
    months: [5, 6],
    monthSpecs: () => modernSpecs(),
  },
  {
    slug: 'legacy',
    name: 'Legacy',
    displayName: 'Legacy',
    formatName: 'Legacy',
    months: [5, 6],
    monthSpecs: () => legacySpecs(),
  },
  {
    slug: 'vintage',
    name: 'Vintage',
    displayName: 'Vintage',
    formatName: 'Vintage',
    months: [5, 6],
    monthSpecs: () => vintageSpecs(),
  },
  {
    slug: 'duel-commander',
    name: 'Duel Commander',
    displayName: 'DC',
    formatName: 'Duel Commander',
    months: [5, 6],
    monthSpecs: () => duelCommanderSpecs(),
  },
]

function buildSynthFormat(def: SynthDef): RawFormat {
  const windows: RawWindow[] = []
  for (const mZero of def.months) {
    const specs = def.monthSpecs(mZero)
    const kpi = kpiFromSpecs(specs, 0.09)
    windows.push(
      buildWindow({
        y: 2026,
        mZero,
        specs,
        kpiTournaments: kpi.tournaments,
        kpiEntries: kpi.entries,
        kpiMatches: kpi.matches,
        seed: `${def.slug}-2026-${pad2(mZero + 1)}`,
        artBySlug: EMPTY_ART,
        formatName: def.formatName,
        matrixTopN: 12,
        duel: def.slug === 'duel-commander',
      })
    )
  }
  return {
    slug: def.slug,
    name: def.name,
    displayName: def.displayName,
    metaChanges: CHANGES[def.slug] ?? [],
    windows,
  }
}

/** Every fixture format: Standard first, then the synthesized ones. */
export function buildFormats(standardArt: Map<string, ArtRef>): RawFormat[] {
  return [buildStandardFormat(standardArt), ...SYNTH_DEFS.map(buildSynthFormat)]
}
