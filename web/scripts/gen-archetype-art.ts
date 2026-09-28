/**
 * gen-archetype-art.ts — generate web/src/datasource/art-map.json
 *
 * Semantics: for every archetype in the live tournament DB (excluding
 * 'Unknown'/'Conflict'), pick a *signature card* — the card that best
 * identifies the deck, not merely the most-played one (which picks
 * format-wide staples like Lightning Bolt / Brainstorm). Scoring lives in
 * scripts/signature-card.ts (distinctiveness vs. the rest of the format,
 * archetype-name match, lands excluded); archetype-art-overrides.json is
 * applied last for cases the heuristic cannot get right.
 *
 * Window: each archetype's decks from the last 365 days of its format's data
 * (anchored on the format's latest tournament, so reruns on the same data are
 * deterministic). Archetypes with fewer than MIN_RECENT_DECKS recent decks use
 * all-time data. Duel Commander reads the SIDE board, which holds the
 * commander(s) there; every other format reads MAIN.
 *
 * Each distinct signature card is resolved to a Scryfall art-crop URL
 * (front face for double-faced cards). Unresolvable cards map to a null
 * artCropUrl so consumers can render a fallback.
 *
 * Every Scryfall lookup goes through the exact-name /cards/collection
 * endpoint and a returned card is only accepted when its (front-face) name
 * matches a requested name, so a misspelled signature card can never pick up
 * another card's art. There is deliberately no fuzzy fallback.
 *
 * Output is deterministic: formats and archetype slugs are written in sorted
 * order; archetypes that slugify to the same key are resolved by deck count
 * (then name) with a warning. The file is written atomically (tmp + rename).
 *
 * Modes (see --help; pure logic lives in scripts/art-map-lib.ts):
 *   pnpm gen:art        full regeneration; every distinct card is re-fetched.
 *   pnpm gen:art:fill   `--fill-gaps`: seed from the existing art-map.json
 *                       (every non-null cardName -> artCropUrl) and fetch
 *                       only the names still unresolved.
 *   --dry-run           before/after signature report only; writes nothing.
 *   --strict            unused/mismatched overrides exit non-zero.
 *   --report=a,b        formats in the report (default: the five main ones).
 *
 * If any /cards/collection chunk fails at the transport level (HTTP error,
 * network failure, invalid JSON, or retries exhausted), the script exits
 * non-zero and does NOT overwrite art-map.json, so a degraded map is never
 * written silently.
 */

import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import {
  type ArtMapFormats,
  type CandidateRow,
  type CliOptions,
  FILL_GAPS_FLAG,
  type Overrides,
  type PreviousArtMap,
  type PreviousMapRead,
  type Signature,
  type SignaturePick,
  STRICT_FLAG,
  USAGE,
  buildArtMapFormats,
  cardsToFetch,
  collectionIdentifiers,
  compareStrings,
  errorMessage,
  matchArtCrops,
  networkBackoffMs,
  parseCandidateRows,
  parseCliArgs,
  parseCollectionBody,
  parseOverrides,
  parsePreviousMap,
  pickSignatures,
  previousCardName,
  rateLimitDelayMs,
  resolvePreviousMap,
  seedFromPreviousMap,
  serializeArtMap,
  slugifyArchetype,
} from './art-map-lib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = join(root, 'src', 'datasource', 'art-map.json')
const OVERRIDES_PATH = join(root, 'scripts', 'archetype-art-overrides.json')
const ENV_PATH = join(root, '.env.local')

const WINDOW_DAYS = 365
const MIN_RECENT_DECKS = 20
/** Candidate floor pulled from the DB; the picker applies its own, stricter
 *  MIN_PRESENCE — this only keeps the row count small. */
const CANDIDATE_FLOOR = 0.25
const COMMANDER_FORMAT = 'duel-commander'

// One pass over deck_cards for the chosen entries. Per (archetype, card):
// decks playing it + copies; per (format, card): decks playing it across the
// same chosen entries, so pRest = (fmt_card_decks − decks) / (fmt − arch).
// recent_90 only orders the before/after report (printed on every run); it is
// not written to the map.
const QUERY = `
with fmt_max as (
  select format_id, max(date) as mx from tournaments group by format_id
), entries as (
  select te.id, a.format_id, te.archetype_id,
         t.date > fm.mx - make_interval(days => ${WINDOW_DAYS}) as recent,
         t.date > fm.mx - interval '90 days' as recent_90
  from tournament_entries te
  join tournaments t on t.id = te.tournament_id
  join archetypes a on a.id = te.archetype_id
  join fmt_max fm on fm.format_id = a.format_id
), arch_n as (
  select archetype_id,
         count(*) filter (where recent) as n_recent,
         count(*) filter (where recent_90) as n_recent_90
  from entries group by archetype_id
), chosen as (
  select e.id, e.format_id, e.archetype_id,
         case when f.name = '${COMMANDER_FORMAT}' then 'SIDE' else 'MAIN' end as board
  from entries e
  join arch_n an using (archetype_id)
  join formats f on f.id = e.format_id
  where e.recent or an.n_recent < ${MIN_RECENT_DECKS}
), arch_tot as (
  select archetype_id, count(*) as n from chosen group by archetype_id
), per_card as (
  select ch.format_id, ch.archetype_id, dc.card_id,
         count(*) as decks, sum(dc.count) as copies
  from chosen ch
  join deck_cards dc on dc.entry_id = ch.id and dc.board = ch.board
  group by 1, 2, 3
), fmt_card as (
  select format_id, card_id, sum(decks) as decks from per_card group by 1, 2
), fmt_tot as (
  select ch.format_id, count(*) as n from chosen ch group by 1
)
select f.name as format_name, a.name as arch_name, c.name as card_name,
       c.is_land, pc.decks::int as decks, pc.copies::int as copies,
       at.n::int as arch_decks, fc.decks::int as fmt_card_decks,
       ft.n::int as fmt_decks, an.n_recent_90::int as recent_90
from per_card pc
join arch_tot at on at.archetype_id = pc.archetype_id
join arch_n an on an.archetype_id = pc.archetype_id
join fmt_card fc on fc.format_id = pc.format_id and fc.card_id = pc.card_id
join fmt_tot ft on ft.format_id = pc.format_id
join cards c on c.id = pc.card_id
join archetypes a on a.id = pc.archetype_id
join formats f on f.id = pc.format_id
where pc.decks >= ${CANDIDATE_FLOOR} * at.n
  and lower(a.name) not in ('unknown', 'conflict')
`

const REPORT_TOP = 15
const COLLECTION_URL = 'https://api.scryfall.com/cards/collection'
const COLLECTION_CHUNK = 75
const MAX_ATTEMPTS = 6
const REQUEST_TIMEOUT_MS = 30_000
/** Politeness gap between collection requests (Scryfall asks for 50–100ms). */
const REQUEST_GAP_MS = 110

const HEADERS = {
  'User-Agent': 'MetaMageArtMap/1.0',
  Accept: 'application/json',
}

// --- env: manual dotenv parse, no new deps; existing env vars win ---
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '')
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function warn(message: string): void {
  console.error(`warning: ${message}`)
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

function loadOverrides(): Overrides {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read ${OVERRIDES_PATH}: ${errorMessage(error)}`)
  }
  return parseOverrides(raw)
}

function readPreviousMap(): PreviousMapRead {
  if (!existsSync(OUT_PATH))
    return { ok: false, reason: `${OUT_PATH} does not exist` }
  try {
    return { ok: true, map: parsePreviousMap(readFileSync(OUT_PATH, 'utf8')) }
  } catch (error) {
    return {
      ok: false,
      reason: `${OUT_PATH} is not a valid art map (${errorMessage(error)})`,
    }
  }
}

// --- step 1: query ---

async function queryCandidates(dbUrl: string): Promise<CandidateRow[]> {
  const sql = postgres(dbUrl)
  try {
    const queryStart = Date.now()
    const rows = parseCandidateRows(await sql.unsafe(QUERY))
    console.log(
      `query: ${rows.length} candidate rows in ${((Date.now() - queryStart) / 1000).toFixed(1)}s`
    )
    return rows
  } finally {
    await sql.end()
  }
}

/** Warns about override problems; returns how many there were. */
function reportOverrideProblems(pick: SignaturePick): number {
  for (const key of pick.unusedOverrides) warn(`unused override ${key}`)
  for (const m of pick.mismatchedOverrides)
    warn(
      `override ${m.format}/${m.archetype} -> "${m.cardName}" is not among the archetype's candidate cards (misspelled?)`
    )
  return pick.unusedOverrides.length + pick.mismatchedOverrides.length
}

function printReport(
  signatures: readonly Signature[],
  previous: PreviousArtMap | null,
  formats: readonly string[]
): void {
  for (const format of formats) {
    console.log(`\n## ${format} (top ${REPORT_TOP} by last-90-day entries)`)
    const top = signatures
      .filter(s => s.formatName === format)
      .sort(
        (a, b) =>
          b.recent90 - a.recent90 || compareStrings(a.archName, b.archName)
      )
      .slice(0, REPORT_TOP)
    for (const s of top) {
      const before =
        previousCardName(previous, format, slugifyArchetype(s.archName)) ?? '—'
      const mark = before === s.cardName ? '=' : '→'
      console.log(
        `  ${s.archName.padEnd(24)} ${before.padEnd(34)} ${mark} ${s.cardName}` +
          (s.overridden ? '  (override)' : '')
      )
    }
  }
}

// --- step 2: fetch ---

type CollectionResult = { ok: true; body: unknown } | { ok: false }

// POST /cards/collection with bounded retries: 429 honours Retry-After (else
// 61s, capped at 120s); network errors/timeouts back off exponentially (also
// capped). Any other non-2xx, an unreadable body, or exhausted retries is a
// transport failure; the caller counts those and refuses to write the map.
async function postCollection(body: string): Promise<CollectionResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const last = attempt === MAX_ATTEMPTS - 1
    let res: Response
    try {
      res = await fetch(COLLECTION_URL, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      console.error(`  collection POST error: ${errorMessage(error)}`)
      if (last) break
      const waitMs = networkBackoffMs(attempt)
      console.error(`  retrying in ${waitMs}ms (attempt ${attempt + 1})`)
      await sleep(waitMs)
      continue
    }
    if (res.status === 429) {
      if (last) break
      const waitMs = rateLimitDelayMs(res.headers.get('retry-after'))
      console.error(`  429, waiting ${waitMs}ms (attempt ${attempt + 1})`)
      await sleep(waitMs)
      continue
    }
    if (!res.ok) {
      console.error(`  collection POST failed: HTTP ${res.status}`)
      return { ok: false }
    }
    try {
      return { ok: true, body: await res.json() }
    } catch (error) {
      console.error(
        `  collection POST: unreadable body (${errorMessage(error)})`
      )
      return { ok: false }
    }
  }
  console.error(`  collection POST gave up after ${MAX_ATTEMPTS} attempts`)
  return { ok: false }
}

type FetchResult = {
  /** lower-cased requested name -> art crop url, or null when Scryfall had no match */
  art: Map<string, string | null>
  /** chunks that failed at transport level; their names are null in `art` */
  failedChunks: number
}

async function fetchArtCrops(
  cardNames: readonly string[]
): Promise<FetchResult> {
  const art = new Map<string, string | null>()
  let failedChunks = 0
  for (let i = 0; i < cardNames.length; i += COLLECTION_CHUNK) {
    const chunk = cardNames.slice(i, i + COLLECTION_CHUNK)
    const result = await postCollection(
      JSON.stringify({ identifiers: collectionIdentifiers(chunk) })
    )
    const cards = result.ok ? parseCollectionBody(result.body) : null
    if (result.ok && !cards)
      console.error('  collection POST: response has no data array')
    if (!cards) failedChunks++
    for (const [lower, url] of matchArtCrops(chunk, cards ?? []))
      art.set(lower, url)
    console.log(
      `  fetched ${Math.min(i + COLLECTION_CHUNK, cardNames.length)}/${cardNames.length}`
    )
    await sleep(REQUEST_GAP_MS)
  }
  return { art, failedChunks }
}

// --- step 3: write ---

function writeArtMap(formats: ArtMapFormats): void {
  const tmpPath = `${OUT_PATH}.tmp`
  writeFileSync(
    tmpPath,
    serializeArtMap({ generatedAt: new Date().toISOString(), formats })
  )
  renameSync(tmpPath, OUT_PATH)

  const entries = Object.values(formats).flatMap(e => Object.values(e))
  const withArt = entries.filter(e => e.artCropUrl !== null).length
  console.log(`art-map.json written: ${statSync(OUT_PATH).size} bytes`)
  console.log(
    `archetypes: ${entries.length}, with art: ${withArt}, null: ${entries.length - withArt}`
  )
}

// --- orchestration ---

async function run(options: CliOptions): Promise<number> {
  const t0 = Date.now()
  loadEnvFile(ENV_PATH)
  const dbUrl = process.env.TOURNAMENT_DATABASE_URL
  if (!dbUrl)
    throw new Error('TOURNAMENT_DATABASE_URL not set (web/.env.local)')

  // Read the map, the fill-gaps seed and the overrides before touching the DB
  // so usage errors fail fast.
  const { previous, warning } = resolvePreviousMap(readPreviousMap(), options)
  if (warning) warn(warning)
  const { seed, skipped } = options.fillGaps
    ? seedFromPreviousMap(previous)
    : { seed: new Map<string, string>(), skipped: [] }
  for (const key of skipped)
    warn(`skipping malformed art-map entry ${key} (no string cardName)`)
  if (options.fillGaps)
    console.log(`fill-gaps: seeded ${seed.size} cards from art-map.json`)
  const overrides = loadOverrides()

  const pick = pickSignatures(await queryCandidates(dbUrl), overrides)
  const overrideProblems = reportOverrideProblems(pick)
  printReport(pick.signatures, previous, options.reportFormats)
  if (options.strict && overrideProblems > 0) {
    console.error(
      `${STRICT_FLAG}: ${overrideProblems} override problem(s); fix ${OVERRIDES_PATH}`
    )
    return 1
  }
  if (options.dryRun) return 0

  const { distinct, toFetch } = cardsToFetch(pick.signatures, seed)
  console.log(
    `\ndistinct cards: ${distinct}, already resolved: ${distinct - toFetch.length}, to fetch: ${toFetch.length}`
  )
  const { art: fetched, failedChunks } = await fetchArtCrops(toFetch)
  if (failedChunks > 0) {
    console.error(
      `${failedChunks} /cards/collection chunk(s) failed at transport level; ` +
        `refusing to write a degraded ${OUT_PATH}. Re-run (or use ${FILL_GAPS_FLAG}) once Scryfall is reachable.`
    )
    return 1
  }

  // seeded entries first, freshly fetched on top; only names still in use
  // end up in the file since the map is rebuilt from the signatures
  const artByLower = new Map<string, string | null>([...seed, ...fetched])
  const { formats, collisions } = buildArtMapFormats(
    pick.signatures,
    artByLower
  )
  for (const c of collisions)
    warn(
      `${c.format}: archetypes ${[c.kept, ...c.dropped].map(n => `"${n}"`).join(', ')} ` +
        `all slugify to "${c.slug}"; keeping "${c.kept}"`
    )
  writeArtMap(formats)
  console.log(`wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  return 0
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseCliArgs(argv)
  if (!parsed.ok) {
    console.error(`${parsed.error}\n\n${USAGE}`)
    return 2
  }
  if (parsed.value.help) {
    console.log(USAGE)
    return 0
  }
  return run(parsed.value)
}

main(process.argv.slice(2)).then(
  code => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(error)
    process.exitCode = 1
  }
)
