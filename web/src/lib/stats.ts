import type { CiMethod } from '@/datasource/types'

// ---------------------------------------------------------------------------
// SINGLE math module, two backends. Every derived stat (both WR formulas, the
// three CI methods, tier bands, matrix reliability/lowN/CI-crossing, presence
// rank) lives here and is called by BOTH the fixture generator AND the future
// Postgres layer for its post-query fields, so the two backends can never
// disagree on CI/tier math. A snapshot test on the seeded fixtures (WP1) guards
// against silent changes.
//
// WP0 shipped SIGNATURES ONLY; WP1 (this file) fills in the implementations. No
// other work package edits this file.
// ---------------------------------------------------------------------------

/** Win/loss/draw counts — the atomic input to every rate + CI calc. */
export type WLD = { wins: number; losses: number; draws: number }

/** A confidence interval, both ends clamped to [0, 1]. */
export type CiBounds = { lo: number; hi: number }

/** A CI with the method that produced it, for UI low-confidence badging. */
export type CiResult = CiBounds & { method: CiMethod }

/** Tier band (non-null); the DTO widens this to `Tier | null` for buckets. */
export type Tier = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3

// ---- Internal helpers ------------------------------------------------------

/** Clamp a number to the closed unit interval [0, 1]. */
function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  return x < 0 ? 0 : x > 1 ? 1 : x
}

// ---- Win rate: two formulas, both carried, never silently picked ----------

/**
 * CANONICAL display win rate (used by charts): `(W + 0.5·D) / (W + L + D)`.
 * Draws count as half a win. Returns 0 when there are no games.
 */
export function wr(wins: number, losses: number, draws: number): number {
  const games = wins + losses + draws
  if (games <= 0) return 0
  return (wins + 0.5 * draws) / games
}

/**
 * Marav-style win rate excluding draws: `W / (W + L)`. Returns 0 when there are
 * no decisive games.
 */
export function wrExclDraws(wins: number, losses: number): number {
  const decisive = wins + losses
  if (decisive <= 0) return 0
  return wins / decisive
}

// ---- Confidence intervals: three methods -----------------------------------

/**
 * Wilson score interval for a binomial proportion `successes / total` at
 * confidence `z` (default 1.96 ≈ 95%). Half-draw records feed in as
 * `successes = W + 0.5·D`, `total = W + L + D`. Bounds clamped to [0, 1];
 * degenerate `total === 0` → `{ lo: 0, hi: 1 }`.
 */
export function wilsonCi(
  successes: number,
  total: number,
  z: number = 1.96
): CiBounds {
  if (total <= 0) return { lo: 0, hi: 1 }
  const p = successes / total
  const z2 = z * z
  const denom = 1 + z2 / total
  const center = p + z2 / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)
  return {
    lo: clamp01((center - margin) / denom),
    hi: clamp01((center + margin) / denom),
  }
}

/**
 * Cluster-robust (sandwich) CI on the mean per-game win value, clustering by
 * player so a single prolific player cannot masquerade as many independent
 * observations. This is the moat: its lower bound `lo` is the CANONICAL ranking
 * key (`wrLo`). Needs ≥ 2 non-degenerate clusters; callers fall back to Wilson
 * below that. Bounds clamped to [0, 1].
 *
 * Each game contributes a win value in {1 (win), 0.5 (draw), 0 (loss)}. The mean
 * `p̂ = Σ(Wg + 0.5·Dg) / N`. The CR1 cluster-robust variance of the mean is
 * `(G/(G−1)) · Σ eg² / N²` with cluster residual `eg = (Wg + 0.5·Dg) − p̂·ng`.
 */
export function clusteredCi(clusters: WLD[], z: number = 1.96): CiBounds {
  const active = clusters.filter(c => c.wins + c.losses + c.draws > 0)
  const G = active.length
  const N = active.reduce((s, c) => s + c.wins + c.losses + c.draws, 0)
  if (G < 2 || N <= 0) return { lo: 0, hi: 1 }
  const successes = active.reduce((s, c) => s + c.wins + 0.5 * c.draws, 0)
  const pHat = successes / N
  let sumSq = 0
  for (const c of active) {
    const ng = c.wins + c.losses + c.draws
    const eg = c.wins + 0.5 * c.draws - pHat * ng
    sumSq += eg * eg
  }
  const variance = (G / (G - 1)) * (sumSq / (N * N))
  const se = Math.sqrt(Math.max(0, variance))
  return { lo: clamp01(pHat - z * se), hi: clamp01(pHat + z * se) }
}

/**
 * Normal-approximation (Wald) binomial interval — the small-sample fallback
 * used when neither clustering nor Wilson is appropriate. Bounds clamped to
 * [0, 1]. Degenerate `total === 0` → `{ lo: 0, hi: 1 }`.
 */
export function binomialCi(
  successes: number,
  total: number,
  z: number = 1.96
): CiBounds {
  if (total <= 0) return { lo: 0, hi: 1 }
  const p = successes / total
  const se = Math.sqrt((p * (1 - p)) / total)
  return { lo: clamp01(p - z * se), hi: clamp01(p + z * se) }
}

/**
 * CI dispatcher: pick the strongest applicable method and tag it. Prefers
 * `clustered` (≥ 2 non-degenerate clusters and ≥ 5 games), else `wilson` (a
 * single cluster or thin clustering but ≥ 5 games), else `binomial` for tiny
 * samples (1–4 games), and `binomial` `{0,1}` for zero games. Returns bounds
 * plus the `CiMethod` for UI badging. This is the one entry point both backends
 * call so the `ciMethod` field is consistent.
 */
export function winrateCi(clusters: WLD[], z: number = 1.96): CiResult {
  const active = clusters.filter(c => c.wins + c.losses + c.draws > 0)
  const games = active.reduce((s, c) => s + c.wins + c.losses + c.draws, 0)
  const successes = active.reduce((s, c) => s + c.wins + 0.5 * c.draws, 0)
  if (games <= 0) return { lo: 0, hi: 1, method: 'binomial' }
  if (active.length >= 2 && games >= 5) {
    return { ...clusteredCi(active, z), method: 'clustered' }
  }
  if (games >= 5) {
    return { ...wilsonCi(successes, games, z), method: 'wilson' }
  }
  return { ...binomialCi(successes, games, z), method: 'binomial' }
}

// ---- Tier bands ------------------------------------------------------------

/**
 * Map a single value to its tier band given the population `mean` and `sd`
 * (standard deviation). Higher value → better (lower-numbered) tier. Bands are
 * 0.5σ wide and centered so the population mean lands in the middle band (1.5).
 * A degenerate `sd <= 0` (all values equal) → every row is the middle band.
 */
export function tierForValue(value: number, mean: number, sd: number): Tier {
  if (!(sd > 0)) return 1.5
  const zScore = (value - mean) / sd
  if (zScore >= 1.5) return 0
  if (zScore >= 1.0) return 0.5
  if (zScore >= 0.5) return 1
  if (zScore > -0.5) return 1.5
  if (zScore > -1.0) return 2
  if (zScore > -1.5) return 2.5
  return 3
}

/**
 * Assign std-dev tier bands over the ranking metric (clustered `wrLo`). Rows are
 * scored against the mean/σ of the non-bucket population: buckets
 * (`unknown`/`conflict`) are excluded from the mean/σ and always receive `null`.
 * Returns one tier (or `null`) per input row, index-aligned. `0` = best band.
 */
export function assignTiers(
  values: number[],
  isBucket: boolean[]
): (Tier | null)[] {
  const pop: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (!isBucket[i]) pop.push(values[i])
  }
  if (pop.length === 0) return values.map(() => null)
  const mean = pop.reduce((s, v) => s + v, 0) / pop.length
  const variance =
    pop.reduce((s, v) => s + (v - mean) * (v - mean), 0) / pop.length
  const sd = Math.sqrt(variance)
  return values.map((v, i) => (isBucket[i] ? null : tierForValue(v, mean, sd)))
}

// ---- Matrix cell helpers ---------------------------------------------------

/** Cell reliability shading weight: `min(1, games / 50)`. */
export function reliability(games: number): number {
  if (games <= 0) return 0
  return Math.min(1, games / 50)
}

/** Low-sample flag: `games < 5` → the cell renders as an em dash '–'. */
export function lowN(games: number): boolean {
  return games < 5
}

/** True when the CI straddles 50% (`ciLow < 0.5 < ciHigh`) — inconclusive. */
export function ciCrosses50(ciLow: number, ciHigh: number): boolean {
  return ciLow < 0.5 && ciHigh > 0.5
}

// ---- Presence ranking ------------------------------------------------------

/**
 * Dense 1-based presence ranks for a set of presence weights (match- or
 * entry-weighted, per the lens). Highest weight → rank 1. Returns one rank per
 * input, index-aligned; ties share a rank (dense ranking — no gaps).
 */
export function presenceRank(weights: number[]): number[] {
  const sorted = [...new Set(weights)].sort((a, b) => b - a)
  const rankOf = new Map<number, number>()
  sorted.forEach((w, i) => rankOf.set(w, i + 1))
  return weights.map(w => rankOf.get(w) as number)
}
