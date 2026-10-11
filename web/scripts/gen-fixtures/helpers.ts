// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

export type Rng = () => number

/** Integer split of `total` into `bins` positive-ish buckets summing exactly. */
export function splitCount(rng: Rng, total: number, bins: number): number[] {
  if (bins <= 0) return []
  if (bins === 1) return [total]
  if (total <= 0) return new Array(bins).fill(0)
  const weights = Array.from({ length: bins }, () => 0.5 + rng())
  const wSum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map(w => (w / wSum) * total)
  const floored = raw.map(Math.floor)
  let rem = total - floored.reduce((a, b) => a + b, 0)
  const fracs = raw
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f)
  let k = 0
  while (rem > 0) {
    floored[fracs[k % bins].i] += 1
    rem -= 1
    k += 1
  }
  return floored
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoDate(y: number, mZero: number, d: number): string {
  return `${y}-${pad2(mZero + 1)}-${pad2(d)}`
}

export function lastDayOfMonth(y: number, mZero: number): number {
  return new Date(Date.UTC(y, mZero + 1, 0)).getUTCDate()
}
