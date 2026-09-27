import * as React from 'react'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// ManaPips — shared identity primitive (§9 rule 3: pips are identity, never a
// chart hue). Printed-cardboard chip colors are THEME-CONSTANT: they resolve to
// the `--chip-*` custom properties, which do not change between light and dark
// (globals.css). Pure color chips — no letter glyphs (user's call: symbols
// read as colors, not characters). Input letters are WUBRG; anything else in
// the input is ignored.
// ---------------------------------------------------------------------------

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G'

const ORDER: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G']
export const CHIP_VAR: Record<ManaColor, string> = {
  W: 'var(--chip-w)',
  U: 'var(--chip-u)',
  B: 'var(--chip-b)',
  R: 'var(--chip-r)',
  G: 'var(--chip-g)',
}

/**
 * Normalize a guild/color input into ordered, de-duplicated WUBRG letters.
 * Accepts a guild code string (`'GW'`, `'wubr'`), an array, or null/undefined.
 * Output is always canonical WUBRG order so an archetype's identity is stable.
 */
export function toManaColors(
  input: string | readonly string[] | null | undefined
): ManaColor[] {
  if (!input) return []
  const chars = Array.isArray(input) ? input.join('') : String(input)
  const seen = new Set<ManaColor>()
  for (const ch of chars.toUpperCase()) {
    if (ch === 'W' || ch === 'U' || ch === 'B' || ch === 'R' || ch === 'G') {
      seen.add(ch)
    }
  }
  return ORDER.filter(c => seen.has(c))
}

export type ManaPipsProps = {
  /** Guild code (`'GW'`), explicit letters, or null → renders nothing. */
  colors: string | readonly string[] | null | undefined
  /** Pip diameter in px (default 15, matching the spike's inline pip). */
  size?: number
  className?: string
}

/**
 * Row of printed mana chips. Server-renderable (no client hooks). Colors come
 * from theme-constant CSS variables so pips read identically in both themes.
 */
export function ManaPips({ colors, size = 15, className }: ManaPipsProps) {
  const pips = toManaColors(colors)
  if (pips.length === 0) return null
  return (
    <span
      className={cn('inline-flex align-[-2px]', className)}
      style={{ gap: 3 }}
      aria-label={`Colors: ${pips.join('')}`}
    >
      {pips.map((c, i) => (
        <span
          key={`${c}-${i}`}
          aria-hidden
          className="inline-grid place-items-center rounded-full"
          style={{
            width: size,
            height: size,
            background: CHIP_VAR[c],
            boxShadow:
              'inset -1px -1.5px 0 rgba(0,0,0,.28), inset 0 0 0 .5px rgba(0,0,0,.18)',
          }}
        />
      ))}
    </span>
  )
}

export default ManaPips
