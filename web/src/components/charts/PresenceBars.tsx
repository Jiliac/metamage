'use client'

import type { ArchetypeRowDTO } from '@/datasource/types'

/**
 * PresenceBars — hand-rolled horizontal presence bars (blueprint §4).
 *
 * 1D encoding: one bar per archetype, width ∝ share. Warm→cool gradient in
 * descending presence order (mirrors the R `plot_presence` fill ramp). The
 * piecewise x-compression from the R chart is deferred; the skeleton is linear.
 * Palette comes from the theme CSS custom properties so light/dark both work.
 */

const fmtPct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`

/** Warm→cool mix across the sorted rows (0 = warmest, 1 = coolest). */
function barColor(frac: number): string {
  const p = Math.round(Math.max(0, Math.min(1, frac)) * 100)
  return `color-mix(in oklab, var(--color-chart-warm), var(--color-chart-cool) ${p}%)`
}

export function PresenceBars({
  rows,
  title = 'Presence',
}: {
  rows: ArchetypeRowDTO[]
  title?: string
}) {
  const sorted = [...rows].sort((a, b) => b.share - a.share)
  const maxShare = sorted.reduce((m, r) => Math.max(m, r.share), 0) || 1

  if (sorted.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">No presence data.</div>
    )
  }

  return (
    <figure className="w-full">
      <figcaption className="text-foreground mb-3 text-sm font-semibold">
        {title}
      </figcaption>
      <ul className="flex flex-col gap-1.5">
        {sorted.map((r, i) => {
          const frac = sorted.length > 1 ? i / (sorted.length - 1) : 0
          const widthPct = (r.share / maxShare) * 100
          return (
            <li
              key={r.slug}
              className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-2 text-xs"
              title={`${r.name}: ${fmtPct(r.share)} presence · ${r.matches} matches · ${r.decks} decks`}
            >
              <span
                className={
                  'truncate text-right ' +
                  (r.isBucket
                    ? 'text-muted-foreground italic'
                    : 'text-foreground')
                }
              >
                {r.name}
              </span>
              <span className="relative flex items-center">
                <span
                  className="h-4 rounded-sm"
                  style={{
                    width: `${Math.max(widthPct, 1)}%`,
                    background: barColor(frac),
                  }}
                />
                <span className="text-muted-foreground ml-1.5 tabular-nums">
                  {fmtPct(r.share)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}

export default PresenceBars
