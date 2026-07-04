/* Stub file: WP0 ships signatures only; every body throws until WP1 implements
 * it. The unused-parameter lint is silenced here on purpose — the real names
 * document the contract. WP1 removes this directive when it fills in the bodies. */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { CiMethod } from '@/datasource/types'

// ---------------------------------------------------------------------------
// SINGLE math module, two backends. Every derived stat (both WR formulas, the
// three CI methods, tier bands, matrix reliability/lowN/CI-crossing, presence
// rank) lives here and is called by BOTH the fixture generator AND the future
// Postgres layer for its post-query fields, so the two backends can never
// disagree on CI/tier math. A snapshot test on the seeded fixtures (WP1) guards
// against silent changes.
//
// WP0 ships SIGNATURES ONLY — bodies throw. WP1 fills in the implementations;
// no other work package edits this file.
// ---------------------------------------------------------------------------

/** Win/loss/draw counts — the atomic input to every rate + CI calc. */
export type WLD = { wins: number; losses: number; draws: number }

/** A confidence interval, both ends clamped to [0, 1]. */
export type CiBounds = { lo: number; hi: number }

/** A CI with the method that produced it, for UI low-confidence badging. */
export type CiResult = CiBounds & { method: CiMethod }

/** Tier band (non-null); the DTO widens this to `Tier | null` for buckets. */
export type Tier = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3

// ---- Win rate: two formulas, both carried, never silently picked ----------

/**
 * CANONICAL display win rate (used by charts): `(W + 0.5·D) / (W + L + D)`.
 * Draws count as half a win. Returns 0 when there are no games.
 */
export function wr(wins: number, losses: number, draws: number): number {
  throw new Error('WP1')
}

/**
 * Marav-style win rate excluding draws: `W / (W + L)`. Returns 0 when there are
 * no decisive games.
 */
export function wrExclDraws(wins: number, losses: number): number {
  throw new Error('WP1')
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
  throw new Error('WP1')
}

/**
 * Cluster-robust (sandwich) CI on the mean per-game win value, clustering by
 * player so a single prolific player cannot masquerade as many independent
 * observations. This is the moat: its lower bound `lo` is the CANONICAL ranking
 * key (`wrLo`). Needs ≥ 2 non-degenerate clusters; callers fall back to Wilson
 * below that. Bounds clamped to [0, 1].
 */
export function clusteredCi(clusters: WLD[], z: number = 1.96): CiBounds {
  throw new Error('WP1')
}

/**
 * Normal-approximation (Wald) binomial interval — the small-sample fallback
 * used when neither clustering nor Wilson is appropriate. Bounds clamped to
 * [0, 1].
 */
export function binomialCi(
  successes: number,
  total: number,
  z: number = 1.96
): CiBounds {
  throw new Error('WP1')
}

/**
 * CI dispatcher: pick the strongest applicable method and tag it. Prefers
 * `clustered` (≥ 2 clusters with enough games), else `wilson`, else `binomial`
 * for tiny samples. Returns bounds plus the `CiMethod` for UI badging. This is
 * the one entry point both backends call so the `ciMethod` field is consistent.
 */
export function winrateCi(clusters: WLD[], z: number = 1.96): CiResult {
  throw new Error('WP1')
}

// ---- Tier bands ------------------------------------------------------------

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
  throw new Error('WP1')
}

/**
 * Map a single value to its tier band given the population `mean` and `sd`
 * (standard deviation). Higher value → better (lower-numbered) tier.
 */
export function tierForValue(value: number, mean: number, sd: number): Tier {
  throw new Error('WP1')
}

// ---- Matrix cell helpers ---------------------------------------------------

/** Cell reliability shading weight: `min(1, games / 50)`. */
export function reliability(games: number): number {
  throw new Error('WP1')
}

/** Low-sample flag: `games < 5` → the cell renders as an em dash '–'. */
export function lowN(games: number): boolean {
  throw new Error('WP1')
}

/** True when the CI straddles 50% (`ciLow < 0.5 < ciHigh`) — inconclusive. */
export function ciCrosses50(ciLow: number, ciHigh: number): boolean {
  throw new Error('WP1')
}

// ---- Presence ranking ------------------------------------------------------

/**
 * Dense 1-based presence ranks for a set of presence weights (match- or
 * entry-weighted, per the lens). Highest weight → rank 1. Returns one rank per
 * input, index-aligned; ties share a rank.
 */
export function presenceRank(weights: number[]): number[] {
  throw new Error('WP1')
}
