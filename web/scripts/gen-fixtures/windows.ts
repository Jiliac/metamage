import seedrandom from 'seedrandom'
import type { TournamentDTO } from '../../src/datasource/types'
import type {
  RawMatchup,
  RawTournament,
  RawWindow,
} from '../../src/datasource/fixtures'
import type { Spec } from '../gen-fixtures.specs'
import { buildArchetype, type ArtRef, type WindowCtx } from './archetypes'
import { attachEntries } from './decks'
import { isoDate, lastDayOfMonth, splitCount, type Rng } from './helpers'

// ---------------------------------------------------------------------------
// Matchups
// ---------------------------------------------------------------------------

/** Synthesize a plausible directional record for a (a vs b) pair. Occasionally
 *  returns null (missing pair) or a sub-5 sample (low-n) to exercise the UI. */
function synthMatchup(
  rng: Rng,
  a: Spec,
  b: Spec
): { w: number; l: number; d: number } | null {
  const roll = rng()
  if (roll < 0.08) return null // no data for this pair
  const expA = Math.min(
    0.8,
    Math.max(0.2, 0.5 + (a.wr - b.wr) / 100 + (rng() - 0.5) * 0.08)
  )
  const cap = Math.min(a.matches, b.matches)
  let n = Math.round(cap * (0.08 + rng() * 0.12))
  if (roll < 0.14) n = Math.round(rng() * 4) // low-n cell
  if (n <= 0) return null
  const w = Math.round(n * expA)
  const l = n - w
  return { w, l, d: 0 }
}

function synthMatchupsForTopN(
  rng: Rng,
  specs: Spec[],
  topN: number,
  fixed: RawMatchup[] = [],
  fixedPairKeys: Set<string> = new Set()
): RawMatchup[] {
  const out: RawMatchup[] = [...fixed]
  const top = specs.filter(s => !s.isBucket).slice(0, topN)
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i]
      const b = top[j]
      const key = `${a.slug}|${b.slug}`
      if (fixedPairKeys.has(key)) continue
      const rec = synthMatchup(rng, a, b)
      if (rec) out.push({ a: a.slug, b: b.slug, w: rec.w, l: rec.l, d: rec.d })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

const SOURCE_MIX: {
  source: TournamentDTO['source']
  label: string
  weight: number
}[] = [
  { source: 'MTGO', label: 'MTGO', weight: 0.62 },
  { source: 'MELEE', label: 'Melee', weight: 0.28 },
  { source: 'CARDSREALM', label: 'CardsRealm', weight: 0.1 },
]

function buildTournaments(
  rng: Rng,
  ctx: WindowCtx,
  count: number,
  totalEntries: number,
  formatName: string
): RawTournament[] {
  if (count <= 0) return []
  const entrySplit = splitCount(rng, totalEntries, count)
  const dayMax = lastDayOfMonth(ctx.y, ctx.mZero)
  const out: RawTournament[] = []
  for (let i = 0; i < count; i++) {
    const r = rng()
    let acc = 0
    let pick = SOURCE_MIX[0]
    for (const s of SOURCE_MIX) {
      acc += s.weight
      if (r <= acc) {
        pick = s
        break
      }
    }
    const day = 1 + Math.floor(rng() * dayMax)
    const date = isoDate(ctx.y, ctx.mZero, day)
    const kind =
      pick.source === 'MTGO' ? (rng() < 0.5 ? 'Challenge' : 'League') : 'Open'
    out.push({
      id: `${ctx.start}-${pick.source.toLowerCase()}-${i + 1}`,
      name: `${pick.label} ${formatName} ${kind}`,
      date,
      source: pick.source,
      link: `https://example.org/${pick.source.toLowerCase()}/${ctx.start}/${i + 1}`, // prettier-ignore
      entries: Math.max(1, entrySplit[i]),
    })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Window assembly
// ---------------------------------------------------------------------------

function makeCtx(
  y: number,
  mZero: number,
  rng: Rng,
  entries: number,
  deckRatio: number
): WindowCtx {
  const start = isoDate(y, mZero, 1)
  const end = isoDate(y, mZero, lastDayOfMonth(y, mZero))
  const weeks = 4
  const weekStarts: string[] = []
  for (let i = 0; i < weeks; i++) {
    weekStarts.push(isoDate(y, mZero, 1 + i * 7))
  }
  const perWeek = splitCount(rng, entries, weeks).map(v => Math.max(1, v))
  return {
    y,
    mZero,
    start,
    end,
    weeks,
    weekStarts,
    fieldDecksPerWeek: perWeek,
    deckRatio,
  }
}

export type WindowInput = {
  y: number
  mZero: number
  specs: Spec[]
  kpiTournaments: number
  kpiEntries: number
  kpiMatches: number
  seed: string
  artBySlug: Map<string, ArtRef>
  formatName: string
  matrixTopN: number
  fixedMatchups?: RawMatchup[]
  /** Duel Commander decks are 99 + a single Commander in the sideboard slot. */
  duel?: boolean
}

export function buildWindow(input: WindowInput): RawWindow {
  const rng = seedrandom(input.seed) as unknown as Rng
  const deckRatio = input.kpiMatches > 0 ? input.kpiEntries / input.kpiMatches : 0.24 // prettier-ignore
  const ctx = makeCtx(input.y, input.mZero, rng, input.kpiEntries, deckRatio)

  const archetypes = input.specs.map(spec =>
    buildArchetype(rng, spec, ctx, input.artBySlug.get(spec.slug) ?? null)
  )

  const fixed = input.fixedMatchups ?? []
  const fixedKeys = new Set(fixed.map(m => `${m.a}|${m.b}`))
  const matchups = synthMatchupsForTopN(
    rng,
    input.specs,
    input.matrixTopN,
    fixed,
    fixedKeys
  )

  const tournaments = buildTournaments(
    rng,
    ctx,
    input.kpiTournaments,
    input.kpiEntries,
    input.formatName
  )

  // KTD12: synthetic recent-deck entries + decklists, each archetype on its
  // own seeded rng so the stats streams above stay byte-identical.
  for (const arch of archetypes) {
    attachEntries(input.seed, arch, tournaments, !!input.duel)
  }

  return {
    start: ctx.start,
    end: ctx.end,
    kpis: {
      tournaments: input.kpiTournaments,
      entries: input.kpiEntries,
      matches: input.kpiMatches,
    },
    archetypes,
    matchups,
    tournaments,
  }
}

export function emptyWindow(y: number, mZero: number): RawWindow {
  return {
    start: isoDate(y, mZero, 1),
    end: isoDate(y, mZero, lastDayOfMonth(y, mZero)),
    kpis: { tournaments: 0, entries: 0, matches: 0 },
    archetypes: [],
    matchups: [],
    tournaments: [],
  }
}
