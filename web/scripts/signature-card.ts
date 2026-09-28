/**
 * signature-card.ts — pure selection of an archetype's "signature card"
 * (the card whose art represents the archetype on tiles).
 *
 * Rule, applied per archetype over its candidate cards (see
 * gen-archetype-art.ts for how the candidate stats are computed):
 *
 *  1. Eligibility: non-land, played in at least MIN_PRESENCE of the
 *     archetype's decks. Rare tech cards can never win.
 *  2. Distinctiveness score = (pArch − pRest) × min(avgCopies, 4) / 4
 *     - pArch: share of the archetype's decks playing the card
 *     - pRest: share of the rest of the format's decks playing it
 *     - the copies factor favours 4-of cores over 1-of silver bullets.
 *     Staples shared across the format (Lightning Bolt, Brainstorm) score
 *     low because pRest is high.
 *  3. Name match wins: if a significant word of the archetype name appears
 *     in an eligible card's name ("Broodscale" → Basking Broodscale,
 *     "Izzet Cauldron" → Agatha's Soul Cauldron) and that card is itself
 *     distinctive (score > 0), the best-scoring such card is chosen.
 *     Colour/guild/strategy/tribal and generic words ("spells", "all",
 *     "free") never match. A name-matched card with score ≤ 0 is ranked
 *     by score like any other card.
 *  4. Ties break by lower pRest, then card name (deterministic).
 *
 * Manual overrides (archetype-art-overrides.json) are applied by the caller
 * after this function.
 */

export type CardCandidate = {
  cardName: string
  isLand: boolean
  /** archetype decks playing the card */
  decks: number
  /** total copies across those decks */
  copies: number
  /** archetype decks in the window */
  archDecks: number
  /** format decks (all archetypes, same window) playing the card */
  fmtCardDecks: number
  /** format decks in the window */
  fmtDecks: number
}

export type ScoredCandidate = CardCandidate & {
  pArch: number
  pRest: number
  avgCopies: number
  score: number
  nameMatch: boolean
}

export const MIN_PRESENCE = 0.5

// Words that describe colours, strategies or tribes, or are generic
// deck-building vocabulary: a card sharing one of these with the archetype
// name says nothing about the deck ("Azorius Control" must not pick Azorius
// Charm; "Faeries" must not pick the first Faerie by alphabet; "Free
// Spells" must not pick Spell Pierce). Matched with singular/plural
// variants, so listing one form is enough.
const STOP_WORDS = new Set(
  (
    'white blue black red green colorless colourless mono ' +
    'azorius dimir rakdos gruul selesnya orzhov izzet golgari boros simic ' +
    'esper grixis jund naya bant abzan jeskai sultai mardu temur ' +
    'four five color colour control aggro midrange combo tempo ramp prison ' +
    'blink value burn stompy lands land energy artifacts artifact madness ' +
    'discard toolbox tribal pile deck big little good bad storm ' +
    'faeries faerie elves elf dwarves dwarf lessons lesson ninjas ninja ' +
    'goblins goblin merfolk slivers sliver zombies zombie humans human ' +
    'spirits spirit eldrazi the and for with ' +
    'all one free spell spells stuff card cards creature creatures other ' +
    'mana self bounce token tokens'
  ).split(' ')
)

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/'s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3)
}

/** The word plus its naive singular/plural so "Rhinos" meets "Rhino". */
function variants(word: string): string[] {
  const plural = word.endsWith('s') ? word.slice(0, -1) : `${word}s`
  return [word, plural]
}

function isStopWord(word: string): boolean {
  return variants(word).some(v => STOP_WORDS.has(v))
}

function archetypeKeywords(archName: string): Set<string> {
  return new Set(
    tokens(archName)
      .filter(w => !isStopWord(w))
      .flatMap(variants)
  )
}

function scoreCandidate(
  c: CardCandidate,
  keywords: Set<string>
): ScoredCandidate {
  const pArch = c.archDecks > 0 ? c.decks / c.archDecks : 0
  const restDecks = c.fmtDecks - c.archDecks
  const pRest =
    restDecks > 0 ? Math.max(0, c.fmtCardDecks - c.decks) / restDecks : 0
  const avgCopies = c.decks > 0 ? c.copies / c.decks : 0
  const score = (pArch - pRest) * (Math.min(avgCopies, 4) / 4)
  // front face only for MDFC/split names ("A // B")
  const front = c.cardName.split(' // ')[0]
  const nameMatch = tokens(front).some(w => keywords.has(w))
  return { ...c, pArch, pRest, avgCopies, score, nameMatch }
}

function compare(a: ScoredCandidate, b: ScoredCandidate): number {
  return (
    b.score - a.score ||
    a.pRest - b.pRest ||
    a.cardName.localeCompare(b.cardName)
  )
}

/**
 * Whether a candidate jumps ahead of the score ranking on its name alone.
 * Requires score > 0 (the card is more common in this archetype than in the
 * rest of the format) rather than a pRest ceiling: score already folds pRest
 * against pArch, so this adds no new tuning knob, and a card that is no more
 * characteristic of the deck than of the field cannot be its signature by
 * fiat.
 */
export function hasNamePriority(c: ScoredCandidate): boolean {
  return c.nameMatch && c.score > 0
}

/**
 * Eligible candidates, best first: distinctive name matches (see
 * hasNamePriority) ahead of the rest, each group ordered by score.
 */
export function rankSignatureCandidates(
  archName: string,
  candidates: readonly CardCandidate[]
): ScoredCandidate[] {
  const keywords = archetypeKeywords(archName)
  const eligible = candidates
    .filter(c => !c.isLand)
    .map(c => scoreCandidate(c, keywords))
    .filter(c => c.pArch >= MIN_PRESENCE)
    .sort(compare)
  return [
    ...eligible.filter(hasNamePriority),
    ...eligible.filter(c => !hasNamePriority(c)),
  ]
}

/**
 * The signature card, or — for incoherent buckets where no card reaches
 * MIN_PRESENCE — the most-played non-land card so the tile still has art.
 */
export function pickSignatureCard(
  archName: string,
  candidates: readonly CardCandidate[]
): ScoredCandidate | null {
  const best = rankSignatureCandidates(archName, candidates)[0]
  if (best) return best
  const keywords = archetypeKeywords(archName)
  const fallback = candidates
    .filter(c => !c.isLand)
    .map(c => scoreCandidate(c, keywords))
    .sort(
      (a, b) =>
        b.pArch - a.pArch ||
        b.copies - a.copies ||
        a.cardName.localeCompare(b.cardName)
    )
  return fallback[0] ?? null
}
