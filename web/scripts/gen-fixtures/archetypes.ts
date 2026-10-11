import type {
  RawArchetype,
  RawPlayer,
  RawTrendWeek,
} from '../../src/datasource/fixtures'
import type { Spec } from '../gen-fixtures.specs'
import { buildCards } from './cards'
import { splitCount, type Rng } from './helpers'

// ---------------------------------------------------------------------------
// Archetype spec → RawArchetype
// ---------------------------------------------------------------------------

/** An archetype's signature-card art, as fetched from Scryfall. */
export type ArtRef = { cardName: string; artCropUrl: string | null }

export type WindowCtx = {
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

/** The spec's match count as a W/L/D record at its target win rate. */
function specRecord(spec: Spec): {
  wins: number
  losses: number
  draws: number
} {
  const matches = spec.matches
  const draws = spec.drawsPct ? Math.round(matches * spec.drawsPct) : 0
  const decisive = matches - draws
  const wins = Math.round((decisive * spec.wr) / 100)
  const losses = decisive - wins
  return { wins, losses, draws }
}

function buildPlayers(
  rng: Rng,
  slug: string,
  decks: number,
  wins: number,
  losses: number,
  draws: number
): RawPlayer[] {
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
    rawPlayers.push({ p: `${slug}-p${i + 1}`, w, l, d })
  }
  return rawPlayers
}

export function buildArchetype(
  rng: Rng,
  spec: Spec,
  ctx: WindowCtx,
  art: ArtRef | null
): RawArchetype {
  const matches = spec.matches
  const { wins, losses, draws } = specRecord(spec)

  const decks = Math.max(
    1,
    Math.round(matches * ctx.deckRatio * (0.9 + rng() * 0.2))
  )

  const rawPlayers = buildPlayers(rng, spec.slug, decks, wins, losses, draws)

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
    entries: [],
    deckLists: [],
  }
}
