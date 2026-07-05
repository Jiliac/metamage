/*
 * gen-fixtures.ts — seeded, deterministic fixture generator (blueprint §5).
 *
 * Emits RAW per-archetype (per-player W/L/D, for clustering) and per-matchup
 * (per unordered pair W/L/D) counts as ONE typed JSON DB at
 * src/datasource/fixtures/data/db.json. It imports the raw schema types from the
 * data source, so a fixture that drifts from the contract fails `tsc`. No
 * derived stats are stored — FixtureDataSource computes every rate/CI/tier via
 * @/lib/stats at read time, so the fixture and Postgres backends can never
 * disagree. Signature-card art_crop URLs are fetched from Scryfall AT GENERATION
 * TIME (network here is fine; never at runtime) with a graceful null fallback.
 *
 * Run: pnpm gen:fixtures    (then: pnpm test && pnpm exec tsc --noEmit)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import seedrandom from 'seedrandom'
import type { MetaChangeDTO, TournamentDTO } from '../src/datasource/types'
import type {
  RawArchetype,
  RawCard,
  RawDb,
  RawFormat,
  RawMatchup,
  RawPlayer,
  RawTournament,
  RawTrendWeek,
  RawWindow,
} from '../src/datasource/fixtures'

// A frozen timestamp so the committed DB (and its snapshot test) is stable.
const GENERATED_AT = '2026-07-05T00:00:00.000Z'

type Rng = () => number

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** Integer split of `total` into `bins` positive-ish buckets summing exactly. */
function splitCount(rng: Rng, total: number, bins: number): number[] {
  if (bins <= 0) return []
  if (bins === 1) return [total]
  if (total <= 0) return new Array(bins).fill(0)
  const weights = Array.from({ length: bins }, () => 0.5 + rng())
  const wSum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map(w => (w / wSum) * total)
  const floored = raw.map(Math.floor)
  let rem = total - floored.reduce((a, b) => a + b, 0)
  const fracs = raw
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f)
  let k = 0
  while (rem > 0) {
    floored[fracs[k % bins].i] += 1
    rem -= 1
    k += 1
  }
  return floored
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(y: number, mZero: number, d: number): string {
  return `${y}-${pad2(mZero + 1)}-${pad2(d)}`
}

function lastDayOfMonth(y: number, mZero: number): number {
  return new Date(Date.UTC(y, mZero + 1, 0)).getUTCDate()
}

// ---------------------------------------------------------------------------
// Card pools (lowercase, as stored in the DB) for synthesized decklists
// ---------------------------------------------------------------------------

const COLOR_POOL: Record<string, string[]> = {
  W: ['guide of souls', 'novice inspector', 'ocelot pride', 'leonin lightscribe'], // prettier-ignore
  U: ['spyglass siren', 'stormchaser drake', 'faerie mastermind', 'consider'],
  B: ['deep-cavern bat', 'gix flatterer', 'sheoldred the apocalypse', 'cut down'], // prettier-ignore
  R: ['monastery swiftspear', 'kumano faces kakkazan', 'lightning bolt', 'urabrask'], // prettier-ignore
  G: ['llanowar elves', 'scavenging ooze', 'wildwood scourge', 'collision of realms'], // prettier-ignore
}
const COLORLESS_POOL = ['mishras bauble', 'relic of legends', 'the mycosynth gardens'] // prettier-ignore
const BASIC: Record<string, string> = {
  W: 'plains',
  U: 'island',
  B: 'swamp',
  R: 'mountain',
  G: 'forest',
}

function slugifyCard(name: string): string {
  return name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function buildCards(
  rng: Rng,
  colorCode: string | null,
  decks: number,
  signature: string | null
): { main: RawCard[]; side: RawCard[] } {
  const letters = (colorCode ?? '').split('').filter(c => 'WUBRG'.includes(c))
  const pool: string[] = []
  for (const l of letters) pool.push(...COLOR_POOL[l])
  pool.push(...COLORLESS_POOL)
  const lands = letters.length
    ? letters.map(l => BASIC[l])
    : ['wastes', 'command tower']

  const names: string[] = []
  if (signature) names.push(signature.toLowerCase())
  for (const n of pool) if (!names.includes(n)) names.push(n)
  for (const n of lands) if (!names.includes(n)) names.push(n)

  const main: RawCard[] = names.slice(0, 9).map((name, i) => {
    const isLand = lands.includes(name)
    const isSig = i === 0 && signature !== null
    const decksPlaying = Math.max(
      1,
      Math.round(decks * (isSig ? 1 : 0.45 + rng() * 0.5))
    )
    const avg = isLand
      ? 3 + Math.round(rng() * 5)
      : isSig
        ? 3 + Math.round(rng())
        : 1 + Math.round(rng() * 2)
    return {
      cardId: slugifyCard(name),
      name,
      avgCount: avg,
      decksPlaying: Math.min(decksPlaying, decks),
      presencePct: decks > 0 ? Math.min(1, decksPlaying / decks) : 0,
    }
  })

  const side: RawCard[] = pool.slice(0, 5).map(name => {
    const decksPlaying = Math.max(1, Math.round(decks * (0.2 + rng() * 0.5)))
    return {
      cardId: `sb-${slugifyCard(name)}`,
      name,
      avgCount: 1 + Math.round(rng()),
      decksPlaying: Math.min(decksPlaying, decks),
      presencePct: decks > 0 ? Math.min(1, decksPlaying / decks) : 0,
    }
  })

  return { main, side }
}

// ---------------------------------------------------------------------------
// Archetype spec → RawArchetype
// ---------------------------------------------------------------------------

type Spec = {
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

type WindowCtx = {
  y: number
  mZero: number
  start: string
  end: string
  weeks: number
  weekStarts: string[]
  fieldDecksPerWeek: number[]
  deckRatio: number
}

function buildTrend(
  rng: Rng,
  ctx: WindowCtx,
  decks: number,
  wins: number,
  losses: number,
  draws: number,
  gapWeek: boolean
): RawTrendWeek[] {
  const active = gapWeek ? Math.max(1, ctx.weeks - 1) : ctx.weeks
  const gapIdx = gapWeek ? 0 : -1
  const wSplit = splitCount(rng, wins, active)
  const lSplit = splitCount(rng, losses, active)
  const dSplit = splitCount(rng, draws, active)
  const deckSplit = splitCount(rng, decks, active)
  const out: RawTrendWeek[] = []
  let ai = 0
  for (let i = 0; i < ctx.weeks; i++) {
    if (i === gapIdx) {
      out.push({
        weekStart: ctx.weekStarts[i],
        w: 0,
        l: 0,
        d: 0,
        decks: 0,
        fieldDecks: ctx.fieldDecksPerWeek[i],
      })
      continue
    }
    out.push({
      weekStart: ctx.weekStarts[i],
      w: wSplit[ai],
      l: lSplit[ai],
      d: dSplit[ai],
      decks: deckSplit[ai],
      fieldDecks: ctx.fieldDecksPerWeek[i],
    })
    ai += 1
  }
  return out
}

function buildArchetype(
  rng: Rng,
  spec: Spec,
  ctx: WindowCtx,
  art: { cardName: string; artCropUrl: string | null } | null
): RawArchetype {
  const matches = spec.matches
  const draws = spec.drawsPct ? Math.round(matches * spec.drawsPct) : 0
  const decisive = matches - draws
  const wins = Math.round((decisive * spec.wr) / 100)
  const losses = decisive - wins

  const decks = Math.max(
    1,
    Math.round(matches * ctx.deckRatio * (0.9 + rng() * 0.2))
  )

  const games = wins + losses + draws
  let players = Math.max(2, Math.round(decks * 0.7))
  if (players > games) players = Math.max(1, games)
  const pw = splitCount(rng, wins, players)
  const pl = splitCount(rng, losses, players)
  const pd = splitCount(rng, draws, players)
  const rawPlayers: RawPlayer[] = []
  for (let i = 0; i < players; i++) {
    const w = pw[i] ?? 0
    const l = pl[i] ?? 0
    const d = pd[i] ?? 0
    if (w + l + d === 0) continue
    rawPlayers.push({ p: `${spec.slug}-p${i + 1}`, w, l, d })
  }

  const { main, side } = buildCards(rng, spec.color, decks, spec.card ?? null)
  const trend = buildTrend(rng, ctx, decks, wins, losses, draws, !!spec.gapWeek)

  return {
    slug: spec.slug,
    name: spec.name,
    color: spec.color,
    isBucket: !!spec.isBucket,
    art,
    decks,
    players: rawPlayers,
    mainCards: main,
    sideCards: side,
    trend,
  }
}

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

type WindowInput = {
  y: number
  mZero: number
  specs: Spec[]
  kpiTournaments: number
  kpiEntries: number
  kpiMatches: number
  seed: string
  artBySlug: Map<string, { cardName: string; artCropUrl: string | null }>
  formatName: string
  matrixTopN: number
  fixedMatchups?: RawMatchup[]
}

function buildWindow(input: WindowInput): RawWindow {
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

function emptyWindow(y: number, mZero: number): RawWindow {
  return {
    start: isoDate(y, mZero, 1),
    end: isoDate(y, mZero, lastDayOfMonth(y, mZero)),
    kpis: { tournaments: 0, entries: 0, matches: 0 },
    archetypes: [],
    matchups: [],
    tournaments: [],
  }
}

// ---------------------------------------------------------------------------
// STANDARD — real June 2026 numbers, exactly mirroring the design spike (§9)
// ---------------------------------------------------------------------------

const STANDARD_SPECS: Spec[] = [
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

function standardFixedMatchups(): RawMatchup[] {
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
function scaleSpecs(specs: Spec[], factor: number, seed: string): Spec[] {
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

function pauperSpecs(withNayaSpike: boolean): Spec[] {
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

function pioneerSpecs(withLessons: boolean): Spec[] {
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

function modernSpecs(): Spec[] {
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

function legacySpecs(): Spec[] {
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

function vintageSpecs(): Spec[] {
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

function duelCommanderSpecs(): Spec[] {
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
function kpiFromSpecs(
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
// Scryfall art fetch (generation-time only, graceful null fallback)
// ---------------------------------------------------------------------------

async function fetchArtCrop(cardName: string): Promise<string | null> {
  try {
    const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MetaMageFixtures/1.0', Accept: 'application/json' }, // prettier-ignore
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      image_uris?: { art_crop?: string }
      card_faces?: { image_uris?: { art_crop?: string } }[]
    }
    return (
      data.image_uris?.art_crop ??
      data.card_faces?.[0]?.image_uris?.art_crop ??
      null
    )
  } catch {
    return null
  }
}

async function buildStandardArt(): Promise<
  Map<string, { cardName: string; artCropUrl: string | null }>
> {
  const map = new Map<string, { cardName: string; artCropUrl: string | null }>()
  for (const s of STANDARD_SPECS) {
    if (!s.card) continue
    const artCropUrl = await fetchArtCrop(s.card)
    map.set(s.slug, { cardName: s.card, artCropUrl })
    // Be polite to Scryfall's API between calls.
    await new Promise(r => setTimeout(r, 120))
    const status = artCropUrl ? 'ok' : 'null'
    process.stdout.write(`  art ${s.card} -> ${status}\n`)
  }
  return map
}

// ---------------------------------------------------------------------------
// Meta changes (seeded from repo memory)
// ---------------------------------------------------------------------------

const CHANGES: Record<string, MetaChangeDTO[]> = {
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

const EMPTY_ART = new Map<
  string,
  { cardName: string; artCropUrl: string | null }
>()

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  process.stdout.write(
    'Fetching Standard signature-card art from Scryfall...\n'
  )
  const standardArt = await buildStandardArt()

  const standardFixed = standardFixedMatchups()
  const standardFixedKeys = new Set(standardFixed.map(m => `${m.a}|${m.b}`))
  void standardFixedKeys

  const formats: RawFormat[] = []

  // ---- STANDARD (showcase) ----
  const stdJune = buildWindow({
    y: 2026,
    mZero: 5,
    specs: STANDARD_SPECS,
    kpiTournaments: 58,
    kpiEntries: 1042,
    kpiMatches: 4277,
    seed: 'standard-2026-06',
    artBySlug: standardArt,
    formatName: 'Standard',
    matrixTopN: 12,
    fixedMatchups: standardFixed,
  })
  // July = the current-month default landing; reuse the showcase numbers.
  const stdJuly = buildWindow({
    y: 2026,
    mZero: 6,
    specs: STANDARD_SPECS,
    kpiTournaments: 58,
    kpiEntries: 1042,
    kpiMatches: 4277,
    seed: 'standard-2026-07',
    artBySlug: standardArt,
    formatName: 'Standard',
    matrixTopN: 12,
    fixedMatchups: standardFixed,
  })
  const stdMaySpecs = scaleSpecs(STANDARD_SPECS, 0.9, 'standard-may-scale')
  const stdMay = buildWindow({
    y: 2026,
    mZero: 4,
    specs: stdMaySpecs,
    kpiTournaments: 51,
    kpiEntries: 921,
    kpiMatches: 3782,
    seed: 'standard-2026-05',
    artBySlug: standardArt,
    formatName: 'Standard',
    matrixTopN: 12,
  })

  formats.push({
    slug: 'standard',
    name: 'Standard',
    displayName: 'Standard',
    metaChanges: CHANGES.standard,
    aliases: { 'selesnya-cub': 'selesnya-ouroboroid' },
    windows: [stdMay, stdJune, stdJuly, emptyWindow(2026, 7)],
  })

  // ---- Synthesized formats ----
  type SynthDef = {
    slug: string
    name: string
    displayName: string
    formatName: string
    monthSpecs: (mZero: number) => Spec[]
    months: number[]
  }

  const synthDefs: SynthDef[] = [
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

  for (const def of synthDefs) {
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
        })
      )
    }
    formats.push({
      slug: def.slug,
      name: def.name,
      displayName: def.displayName,
      metaChanges: CHANGES[def.slug] ?? [],
      windows,
    })
  }

  const dbOut: RawDb = { generatedAt: GENERATED_AT, formats }

  const here = dirname(fileURLToPath(import.meta.url))
  const outDir = join(here, '..', 'src', 'datasource', 'fixtures', 'data')
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, 'db.json')
  writeFileSync(outFile, JSON.stringify(dbOut, null, 2) + '\n', 'utf8')

  const totalWindows = formats.reduce((s, f) => s + f.windows.length, 0)
  process.stdout.write(
    `Wrote ${outFile}\n  ${formats.length} formats, ${totalWindows} windows\n`
  )
}

main().catch(err => {
  process.stderr.write(String(err) + '\n')
  process.exit(1)
})
