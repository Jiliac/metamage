import type { MatchupRec } from '@/datasource/derive'
import type { MatchupRow } from '@/datasource/postgres/sql'

// ---------------------------------------------------------------------------
// Oriented matchup lookup over MATCHUPS_SQL rows. Pure; no I/O.
// ---------------------------------------------------------------------------

export const ZERO_REC: MatchupRec = { wins: 0, losses: 0, draws: 0 }

const pairKey = (aId: string, bId: string) => `${aId}|${bId}`

/** Index MATCHUPS_SQL rows by their oriented `${row_id}|${col_id}` key. */
export function matchupIndex(rows: MatchupRow[]): Map<string, MatchupRec> {
  const m = new Map<string, MatchupRec>()
  for (const r of rows) {
    m.set(pairKey(r.row_id, r.col_id), {
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
    })
  }
  return m
}

/**
 * Look up a's record vs b from the oriented one-sided pair list, swapping
 * W/L when only the reverse orientation exists (mirrors the fixtures'
 * `lookupMatchup`). Draws are symmetric. a===b reads the mirror orientation.
 * A missing pair is a zero record.
 */
export function orientedPair(
  index: Map<string, MatchupRec>,
  aId: string,
  bId: string
): MatchupRec {
  if (aId === bId) return index.get(pairKey(aId, bId)) ?? ZERO_REC
  const fwd = index.get(pairKey(aId, bId))
  if (fwd) return fwd
  const rev = index.get(pairKey(bId, aId))
  if (rev) return { wins: rev.losses, losses: rev.wins, draws: rev.draws }
  return ZERO_REC
}
