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
import type { TournamentDTO } from '../src/datasource/types'
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
} from './gen-fixtures.specs'

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
