/**
 * gen-archetype-art.ts — generate web/src/datasource/art-map.json
 *
 * Semantics: for every archetype in the live tournament DB (excluding
 * 'Unknown'/'Conflict'), the signature card is the most-played non-land
 * main-deck card across all recorded decks, all time. Ties break by
 * total copies, then alphabetical card name (deterministic).
 *
 * Each distinct signature card is resolved to a Scryfall art-crop URL
 * (card_faces[0] used for double-faced cards). Unresolvable cards map
 * to a null artCropUrl so consumers can render a fallback.
 *
 * Every Scryfall lookup goes through the exact-name /cards/collection
 * endpoint and a returned card is only accepted when its name matches a
 * requested name, so a misspelled signature card can never pick up another
 * card's art. There is deliberately no fuzzy fallback.
 *
 * Modes:
 *   pnpm gen:art        full regeneration; every distinct card is re-fetched.
 *   pnpm gen:art:fill   `--fill-gaps`: seed from the existing art-map.json
 *                       (every non-null cardName -> artCropUrl), run the DB
 *                       query as usual, and fetch only the names still
 *                       unresolved. Use after a run that left nulls behind
 *                       (e.g. Scryfall 429s) without re-fetching the rest.
 *
 * If any /cards/collection chunk fails at the transport level (HTTP error,
 * network failure, or retries exhausted), the script exits non-zero and does
 * NOT overwrite art-map.json, so a degraded map is never written silently.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = join(root, 'src', 'datasource', 'art-map.json')

// --- CLI flags ---
const FILL_GAPS_FLAG = '--fill-gaps'
const args = process.argv.slice(2)
const unknownArgs = args.filter(a => a !== FILL_GAPS_FLAG)
if (unknownArgs.length > 0) {
  console.error(
    `unknown argument(s): ${unknownArgs.join(' ')}\n` +
      `usage: tsx scripts/gen-archetype-art.ts [${FILL_GAPS_FLAG}]`
  )
  process.exit(2)
}
const fillGaps = args.includes(FILL_GAPS_FLAG)

// --- env: manual dotenv parse, no new deps ---
for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq <= 0) continue
  const key = trimmed.slice(0, eq)
  const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '')
  if (process.env[key] === undefined) process.env[key] = value
}

const QUERY = `
with per_card as (
  select f.name as format_name, a.name as arch_name, c.name as card_name,
         count(distinct dc.entry_id) as decks, sum(dc.count) as copies
  from deck_cards dc
  join tournament_entries te on te.id = dc.entry_id
  join cards c on c.id = dc.card_id
  join archetypes a on a.id = te.archetype_id
  join formats f on f.id = a.format_id
  where dc.board = 'MAIN' and c.is_land = false
    and lower(a.name) not in ('unknown','conflict')
  group by f.name, a.name, c.name
), ranked as (
  select format_name, arch_name, card_name,
         row_number() over (partition by format_name, arch_name
                            order by decks desc, copies desc, card_name asc) rn
  from per_card
)
select format_name, arch_name, card_name from ranked where rn = 1
`

type SignatureRow = {
  format_name: string
  arch_name: string
  card_name: string
}

type ScryfallCard = {
  name?: string
  image_uris?: { art_crop?: string }
  card_faces?: Array<{ image_uris?: { art_crop?: string } }>
}

type ArtEntry = { cardName: string; artCropUrl: string | null }
type ArtMapFile = {
  generatedAt?: string
  formats?: Record<string, Record<string, ArtEntry>>
}

function slugifyArchetype(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extractArtCrop(card: ScryfallCard): string | null {
  return (
    card.image_uris?.art_crop ??
    card.card_faces?.[0]?.image_uris?.art_crop ??
    null
  )
}

/**
 * Seed for --fill-gaps: every non-null artCropUrl in the existing map, keyed
 * by lower-cased cardName. Entries with a null url are left out so they get
 * re-fetched. Throws when the file is missing: filling gaps in a map that
 * does not exist is a usage error, not something to silently degrade into a
 * full run.
 */
function loadExistingArt(path: string): Map<string, string> {
  if (!existsSync(path))
    throw new Error(
      `${FILL_GAPS_FLAG} requires an existing ${path}; run a full generation first`
    )
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ArtMapFile
  const seed = new Map<string, string>()
  for (const entries of Object.values(parsed.formats ?? {})) {
    for (const entry of Object.values(entries)) {
      if (typeof entry.cardName !== 'string') continue
      if (typeof entry.artCropUrl !== 'string' || entry.artCropUrl === '')
        continue
      seed.set(entry.cardName.toLowerCase(), entry.artCropUrl)
    }
  }
  return seed
}

const HEADERS = {
  'User-Agent': 'MetaMageArtMap/1.0',
  Accept: 'application/json',
}

// Batch fetch via /cards/collection (75 identifiers/request, exact-name match).
// 429 handling: Scryfall's cooldown is 60s per its error message. Honor
// Retry-After when present, else wait 61s. Bounded retries keep it finite.
// Returns null on any transport-level failure (non-2xx, network error, or
// retries exhausted); the caller counts those and refuses to write the map.
async function postCollection(body: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body,
      })
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 61000
        console.log(`  429, waiting ${waitMs}ms (attempt ${attempt + 1})`)
        await sleep(waitMs)
        continue
      }
      if (!res.ok) {
        console.log(`  collection POST failed: HTTP ${res.status}`)
        return null
      }
      return res
    } catch (error) {
      console.log(`  collection POST error: ${String(error)}`)
      return null
    }
  }
  console.log('  collection POST gave up after repeated 429s')
  return null
}

type FetchResult = {
  /** lower-cased requested name -> art crop url, or null when Scryfall had no match */
  art: Map<string, string | null>
  /** chunks whose POST returned null (transport failure); their names are null in `art` */
  failedChunks: number
}

async function fetchArtCrops(cardNames: string[]): Promise<FetchResult> {
  const art = new Map<string, string | null>()
  let failedChunks = 0
  const CHUNK = 75
  for (let i = 0; i < cardNames.length; i += CHUNK) {
    const chunk = cardNames.slice(i, i + CHUNK)
    const res = await postCollection(
      JSON.stringify({ identifiers: chunk.map(name => ({ name })) })
    )
    if (res) {
      const data = (await res.json()) as { data?: ScryfallCard[] }
      const names = new Set(chunk.map(n => n.toLowerCase()))
      for (const card of data.data ?? []) {
        // exact-name guard: never attach art returned for a name we did not ask for
        if (card.name && names.has(card.name.toLowerCase())) {
          art.set(card.name.toLowerCase(), extractArtCrop(card))
        }
      }
    } else {
      failedChunks++
    }
    for (const name of chunk)
      if (!art.has(name.toLowerCase())) art.set(name.toLowerCase(), null)
    console.log(
      `  fetched ${Math.min(i + CHUNK, cardNames.length)}/${cardNames.length}`
    )
    await sleep(110)
  }
  return { art, failedChunks }
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

async function main(): Promise<void> {
  const t0 = Date.now()
  const dbUrl = process.env.TOURNAMENT_DATABASE_URL
  if (!dbUrl)
    throw new Error('TOURNAMENT_DATABASE_URL not set (web/.env.local)')

  // Read the seed before touching the DB so a usage error fails fast.
  const seed = fillGaps ? loadExistingArt(OUT_PATH) : new Map<string, string>()
  if (fillGaps)
    console.log(`fill-gaps: seeded ${seed.size} cards from art-map.json`)

  const sql = postgres(dbUrl)
  const queryStart = Date.now()
  const rows = (await sql.unsafe(QUERY)) as unknown as SignatureRow[]
  console.log(
    `query: ${rows.length} archetype rows in ${((Date.now() - queryStart) / 1000).toFixed(1)}s`
  )
  await sql.end()

  // distinct card names, deduped by lowercase across the whole map
  const canonical = new Map<string, string>()
  for (const row of rows)
    canonical.set(row.card_name.toLowerCase(), row.card_name)
  const distinct = [...canonical.values()]
  const toFetch = distinct.filter(name => !seed.has(name.toLowerCase()))
  console.log(
    `distinct cards: ${distinct.length}, already resolved: ${distinct.length - toFetch.length}, to fetch: ${toFetch.length}`
  )

  const { art: fetched, failedChunks } = await fetchArtCrops(toFetch)
  if (failedChunks > 0) {
    console.error(
      `${failedChunks} /cards/collection chunk(s) failed at transport level; ` +
        `refusing to write a degraded ${OUT_PATH}. Re-run (or use ${FILL_GAPS_FLAG}) once Scryfall is reachable.`
    )
    process.exit(1)
  }

  // seeded entries first, freshly fetched on top; only names the DB still
  // uses end up in the file since the map is rebuilt from `rows` below
  const artByLower = new Map<string, string | null>(seed)
  for (const [lower, url] of fetched) artByLower.set(lower, url)

  const formats: Record<string, Record<string, ArtEntry>> = {}
  for (const row of rows) {
    ;(formats[row.format_name] ??= {})[slugifyArchetype(row.arch_name)] = {
      cardName: row.card_name,
      artCropUrl: artByLower.get(row.card_name.toLowerCase()) ?? null,
    }
  }

  const payload = { generatedAt: new Date().toISOString(), formats }
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n')

  const resolved = distinct.filter(
    name => (artByLower.get(name.toLowerCase()) ?? null) !== null
  ).length
  const fileSize = statSync(OUT_PATH).size
  console.log(`art-map.json written: ${fileSize} bytes`)
  console.log(
    `archetypes: ${rows.length}, distinct cards: ${distinct.length}, ` +
      `fetched this run: ${fetched.size}, resolved with art: ${resolved}, ` +
      `null: ${distinct.length - resolved}, ` +
      `wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
