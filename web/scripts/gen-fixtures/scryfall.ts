import type { RawCardData, RawFormat } from '../../src/datasource/fixtures'
import { STANDARD_SPECS } from '../gen-fixtures.specs'
import type { ArtRef } from './archetypes'

// ---------------------------------------------------------------------------
// Scryfall card-data fetch (KTD12, generation-time only, HARD failure)
// ---------------------------------------------------------------------------

/** The subset of a Scryfall card object the KTD1 mapping reads. */
type ScryfallCard = {
  name: string
  layout?: string
  mana_cost?: string
  cmc?: number
  type_line?: string
  image_uris?: { normal?: string }
  card_faces?: {
    type_line?: string
    mana_cost?: string
    image_uris?: { normal?: string }
  }[]
  scryfall_uri?: string
}

/** Mirror of `src/ingest/scryfall_fields.py` (KTD2): top-level images win;
 *  faced cards take the FRONT face's type line and cost except split cards,
 *  which keep the combined top-level cost. */
function extractCardFields(card: ScryfallCard): RawCardData {
  const faces = card.card_faces ?? []
  const first = faces[0]
  const second = faces[1]
  let imageNormal: string | null = null
  let imageBack: string | null = null
  if (card.image_uris?.normal) {
    imageNormal = card.image_uris.normal
  } else {
    imageNormal = first?.image_uris?.normal ?? null
    imageBack = second?.image_uris?.normal ?? null
  }
  let typeLine: string | null
  let manaCost: string | null
  if (first) {
    typeLine = first.type_line ?? null
    manaCost =
      card.layout === 'split'
        ? (card.mana_cost ?? null)
        : (first.mana_cost ?? null)
  } else {
    typeLine = card.type_line ?? null
    manaCost = card.mana_cost ?? null
  }
  return {
    displayName: card.name,
    typeLine,
    manaCost,
    cmc: card.cmc ?? null,
    imageNormal,
    imageBack,
    scryfallUri: card.scryfall_uri ?? null,
  }
}

/** Every lowercase card name the fixture DB plays, collected from the built
 *  windows (adoption pools + sampled decklists), sorted for deterministic
 *  request chunking and map order. */
export function collectCardNames(formats: RawFormat[]): string[] {
  const names = new Set<string>()
  for (const f of formats) {
    for (const w of f.windows) {
      for (const a of w.archetypes) {
        for (const c of [...a.mainCards, ...a.sideCards]) names.add(c.name)
        for (const list of a.deckLists) {
          for (const row of [...list.main, ...list.side]) names.add(row.n)
        }
      }
    }
  }
  return [...names].sort()
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

/** POST one chunk of name identifiers; network and HTTP failures throw. */
async function requestCollection(chunk: string[]): Promise<Response> {
  let res: Response
  try {
    res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MetaMageFixtures/1.0',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        identifiers: chunk.map(name => ({ name })),
      }),
    })
  } catch (err) {
    throw new Error(`Scryfall /cards/collection request failed: ${String(err)}`)
  }
  if (!res.ok) {
    throw new Error(`Scryfall /cards/collection returned HTTP ${res.status}`)
  }
  return res
}

/** Parse a collection response, throwing on any `not_found` name or on a
 *  card count that does not match the chunk. */
async function readCollection(
  res: Response,
  chunk: string[]
): Promise<ScryfallCard[]> {
  const body = (await res.json()) as {
    data?: ScryfallCard[]
    not_found?: { name?: string }[]
  }
  if (body.not_found && body.not_found.length > 0) {
    const missing = body.not_found
      .map(n => n.name ?? JSON.stringify(n))
      .join(', ')
    throw new Error(
      `Scryfall /cards/collection could not find: ${missing} — fix the fixture card pools in gen-fixtures/cards.ts`
    )
  }
  const cards = body.data ?? []
  if (cards.length !== chunk.length) {
    throw new Error(
      `Scryfall /cards/collection returned ${cards.length} cards for ${chunk.length} identifiers`
    )
  }
  return cards
}

/** Resolve the KTD1 card data for every fixture card name via Scryfall
 *  `/cards/collection` (75 identifiers per request, 2 req/s). The `name`
 *  identifier resolves case- and punctuation-insensitively
 *  ('sheoldred the apocalypse' → 'Sheoldred, the Apocalypse'). Any `not_found`
 *  — or any HTTP/network failure — aborts generation: a fixture that silently
 *  lost its card data would degrade the decklists tab to text-only names. */
export async function fetchCardData(
  names: string[]
): Promise<Record<string, RawCardData>> {
  const out: Record<string, RawCardData> = {}
  for (let i = 0; i < names.length; i += 75) {
    const chunk = names.slice(i, i + 75)
    const res = await requestCollection(chunk)
    const cards = await readCollection(res, chunk)
    // With `not_found` empty the results come back in request order (docs), so
    // each card maps back to its requested name; the response `name` may differ
    // in case/punctuation from the fixture's lowercase key.
    chunk.forEach((name, j) => {
      out[name] = extractCardFields(cards[j])
    })
    if (i + 75 < names.length) {
      // Honor the 2 req/s rate limit between chunks.
      await sleep(600)
    }
  }
  return out
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

export async function buildStandardArt(): Promise<Map<string, ArtRef>> {
  const map = new Map<string, ArtRef>()
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

export const EMPTY_ART = new Map<string, ArtRef>()
