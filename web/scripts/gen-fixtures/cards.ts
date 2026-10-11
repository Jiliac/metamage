import type { RawCard } from '../../src/datasource/fixtures'
import type { Rng } from './helpers'

// ---------------------------------------------------------------------------
// Card pools (lowercase, as stored in the DB) for synthesized decklists
// ---------------------------------------------------------------------------

const COLOR_POOL: Record<string, string[]> = {
  W: ['guide of souls', 'novice inspector', 'ocelot pride', 'leonin lightscribe'], // prettier-ignore
  U: ['spyglass siren', 'stormchaser drake', 'faerie mastermind', 'consider'],
  B: ['deep-cavern bat', 'gix, yawgmoth praetor', 'sheoldred the apocalypse', 'cut down'], // prettier-ignore
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

/** The WUBRG letters of an archetype color code (anything else dropped). */
export function colorLetters(colorCode: string | null): string[] {
  return (colorCode ?? '').split('').filter(c => 'WUBRG'.includes(c))
}

/** The canonical basics for those letters; colorless decks get Wastes and
 *  Command Tower. */
export function basicLands(letters: string[]): string[] {
  return letters.length
    ? letters.map(l => BASIC[l])
    : ['wastes', 'command tower']
}

function slugifyCard(name: string): string {
  return name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function buildMainCards(
  rng: Rng,
  names: string[],
  lands: string[],
  decks: number,
  signature: string | null
): RawCard[] {
  return names.map((name, i) => {
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
}

function buildSideCards(rng: Rng, names: string[], decks: number): RawCard[] {
  return names.map(name => {
    const decksPlaying = Math.max(1, Math.round(decks * (0.2 + rng() * 0.5)))
    return {
      cardId: `sb-${slugifyCard(name)}`,
      name,
      avgCount: 1 + Math.round(rng()),
      decksPlaying: Math.min(decksPlaying, decks),
      presencePct: decks > 0 ? Math.min(1, decksPlaying / decks) : 0,
    }
  })
}

export function buildCards(
  rng: Rng,
  colorCode: string | null,
  decks: number,
  signature: string | null
): { main: RawCard[]; side: RawCard[] } {
  const letters = colorLetters(colorCode)
  const pool: string[] = []
  for (const l of letters) pool.push(...COLOR_POOL[l])
  pool.push(...COLORLESS_POOL)
  const lands = basicLands(letters)

  const names: string[] = []
  if (signature) names.push(signature.toLowerCase())
  for (const n of pool) if (!names.includes(n)) names.push(n)
  for (const n of lands) if (!names.includes(n)) names.push(n)

  const main = buildMainCards(rng, names.slice(0, 9), lands, decks, signature)
  const side = buildSideCards(rng, pool.slice(0, 5), decks)

  return { main, side }
}
