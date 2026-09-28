// ---------------------------------------------------------------------------
// Matchup cell facts (KTD2) — the §9-rule-5 math, stated once. The matrix grid
// and the matchup list render the SAME numbers from these helpers so the
// confidence-as-ink encoding can never fork between surfaces. Pure functions;
// no React, no client/server boundary concerns — importable from RSC files.
// ---------------------------------------------------------------------------

/** §9 rule 5 ink fill. `wr`, `reliability` are fractions (0..1). */
export function inkFill(wr: number, reliability: number): string {
  const dev = Math.min(28, Math.abs(wr * 100 - 50))
  const conf = Math.max(0, Math.min(1, reliability))
  const amt = (6 + dev * 2.1) * (0.35 + 0.65 * conf)
  const pole = wr >= 0.5 ? 'var(--good)' : 'var(--bad)'
  return `color-mix(in oklab, ${pole} ${amt.toFixed(1)}%, var(--raised))`
}

/** Integer percent for inline cell values (`48%`). */
export const pctI = (x: number): string => `${Math.round(x * 100)}%`

/** Record text with the ledger's en dash (`12–8`); draws are appended by the
 *  caller when the surface shows them. */
export const rec = (w: number, l: number): string => `${w}–${l}`

/** Inline one-decimal CI span (`47.4–55.7`) — the grid tooltip's CI, readable
 *  without hover on the list (R5). */
export const ciText = (low: number, high: number): string =>
  `${(low * 100).toFixed(1)}–${(high * 100).toFixed(1)}`
