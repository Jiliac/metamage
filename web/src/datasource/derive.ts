import type {
  ArchetypeRowDTO,
  ArchetypeSlug,
  MatchupCellDTO,
  MetaQuery,
  MetaReportDTO,
  MetaSort,
} from '@/datasource/types'
import {
  assignTiers,
  ciCrosses50,
  lowN,
  presenceRank,
  reliability,
  wilsonCi,
  wr as wrOf,
  type Tier,
  type WLD,
} from '@/lib/stats'

// ---------------------------------------------------------------------------
// derive.ts — the backend-agnostic half of the read path. Both
// `FixtureDataSource` and `PostgresDataSource` produce an `IntrinsicRow` per
// archetype from their own raw shapes, then hand those rows to the functions
// here for presence ranking, the topN / minMatches / includeArchetypes /
// hideBuckets / tier selection, sorting, and matchup-cell math. Because there
// is exactly one implementation, the fixtures snapshot test guards the
// Postgres backend's selection semantics too (blueprint §8 risk 8).
//
// Every function here is pure: no I/O, no module state, inputs never mutated.
// ---------------------------------------------------------------------------

const asSlug = (s: string) => s as ArchetypeSlug

/** The table's default sort key (presence desc). */
export const DEFAULT_SORT: MetaSort = 'presence'

/** Everything about a row that is intrinsic to the archetype (the population
 *  fields `presenceRank` + `tier` are filled in by `selectReportRows`). */
export type IntrinsicRow = Omit<ArchetypeRowDTO, 'presenceRank' | 'tier'>

/** Presence weight per the lens: match-weighted (games) or entry-weighted. */
export function weightOf(
  row: IntrinsicRow,
  weight: MetaQuery['weight']
): number {
  return weight === 'entry' ? row.decks : row.matches
}

/**
 * Assign presence ranks (identity numbers, §9 rule 3) over the FULL window
 * population, non-buckets first (ranked 1..k by weight), then buckets after.
 * Returns a slug → rank map so every view can share the number.
 */
export function presenceRankMap(
  rows: IntrinsicRow[],
  weight: MetaQuery['weight']
): Map<string, number> {
  const nonBucket = rows.filter(r => !r.isBucket)
  const buckets = rows.filter(r => r.isBucket)
  const map = new Map<string, number>()
  const nbRanks = presenceRank(nonBucket.map(r => weightOf(r, weight)))
  nonBucket.forEach((r, i) => map.set(r.slug, nbRanks[i]))
  const offset = nonBucket.length
  const bRanks = presenceRank(buckets.map(r => weightOf(r, weight)))
  buckets.forEach((r, i) => map.set(r.slug, offset + bRanks[i]))
  return map
}

// ---- Sorting ---------------------------------------------------------------

export function sortRows(
  rows: ArchetypeRowDTO[],
  sort: MetaSort,
  weight: MetaQuery['weight']
): ArchetypeRowDTO[] {
  const out = [...rows]
  out.sort((a, b) => {
    // Buckets always sink to the bottom regardless of the sort key.
    if (a.isBucket !== b.isBucket) return a.isBucket ? 1 : -1
    if (sort === 'wrlo') return b.wrLo - a.wrLo
    if (sort === 'tier') {
      const ta = a.tier ?? 99
      const tb = b.tier ?? 99
      if (ta !== tb) return ta - tb
      return b.wrLo - a.wrLo
    }
    // presence (default): by weight desc, then rank asc for stability.
    const wa = weight === 'entry' ? a.decks : a.matches
    const wb = weight === 'entry' ? b.decks : b.matches
    if (wb !== wa) return wb - wa
    return a.presenceRank - b.presenceRank
  })
  return out
}

// ---- Selection -------------------------------------------------------------

/** The report body: the displayed, sorted rows plus the collapsed tail. */
export type ReportSelection = {
  rows: ArchetypeRowDTO[]
  other: MetaReportDTO['other']
}

/**
 * Run the selection pipeline over the full window population, exactly as the
 * SQL would: attach presence ranks, keep the non-bucket rows that clear the
 * match floor or are force-added, cut to topN by presence weight (force-added
 * rows are unioned back in), band tiers over that displayed field, append
 * buckets unless hidden, sort, and size the "other" tail against `denom`.
 */
export function selectReportRows(
  intrinsics: IntrinsicRow[],
  denomMatches: number,
  q: MetaQuery,
  sort: MetaSort
): ReportSelection {
  const rankMap = presenceRankMap(intrinsics, q.weight)

  // Attach presenceRank; tier filled after we know the displayed field.
  const rows: ArchetypeRowDTO[] = intrinsics.map(r => ({
    ...r,
    presenceRank: rankMap.get(r.slug) ?? 0,
    tier: null,
  }))

  const include = new Set(q.includeArchetypes.map(s => String(s)))

  // Selection: non-bucket rows that clear the match floor OR are force-added.
  const qualified = rows.filter(
    r => !r.isBucket && (r.matches >= q.minMatches || include.has(r.slug))
  )
  // topN by presence weight, then union in any force-added rows outside topN.
  const byPresence = [...qualified].sort(
    (a, b) => weightOf(b, q.weight) - weightOf(a, q.weight)
  )
  const chosen = new Map<string, ArchetypeRowDTO>()
  byPresence.slice(0, q.topN).forEach(r => chosen.set(r.slug, r))
  qualified.filter(r => include.has(r.slug)).forEach(r => chosen.set(r.slug, r))

  const field = [...chosen.values()]

  // Tier bands over the displayed non-bucket field (buckets never in tier math).
  const tiers = assignTiers(
    field.map(r => r.wrLo),
    field.map(() => false)
  )
  const tiered: ArchetypeRowDTO[] = field.map((r, i) => ({
    ...r,
    tier: tiers[i] as Tier,
  }))

  // Buckets appended only when the lens shows them (tier stays null).
  const displayed = q.hideBuckets
    ? tiered
    : tiered.concat(rows.filter(r => r.isBucket))

  const sorted = sortRows(displayed, sort, q.weight)

  const shownMatches = sorted.reduce((s, r) => s + r.matches, 0)
  const otherMatches = Math.max(0, denomMatches - shownMatches)
  const other =
    otherMatches > 0
      ? {
          share: denomMatches > 0 ? otherMatches / denomMatches : 0,
          matches: otherMatches,
        }
      : null

  return { rows: sorted, other }
}

// ---- Matrix cell -----------------------------------------------------------

/** One oriented matchup record (row's W/L/D vs col). */
export type MatchupRec = WLD

export function buildCell(
  rowSlug: string,
  colSlug: string,
  rowName: string,
  colName: string,
  rec: MatchupRec
): MatchupCellDTO {
  const isMirror = rowSlug === colSlug
  const { wins, losses, draws } = rec
  const games = wins + losses + draws
  const ci = wilsonCi(wins + 0.5 * draws, games)
  return {
    rowSlug: asSlug(rowSlug),
    colSlug: asSlug(colSlug),
    rowName,
    colName,
    wins,
    losses,
    draws,
    games,
    wr: wrOf(wins, losses, draws),
    ciLow: ci.lo,
    ciHigh: ci.hi,
    reliability: reliability(games),
    lowN: lowN(games),
    ciCrosses50: ciCrosses50(ci.lo, ci.hi),
    isMirror,
  }
}
