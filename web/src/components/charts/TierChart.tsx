'use client'

import type { ArchetypeRowDTO } from '@/datasource/types'

/**
 * TierChart — hand-rolled SVG dot plot + tier chips (blueprint §4).
 *
 * 1D encoding: rows sorted by `wrLo`, a dot positioned at `wrLo` coloured by its
 * std-dev tier band, name on the left and a tier chip on the right. Mirrors the
 * R `plot_tiers`. Tier colours come from the `--color-tier-*` palette vars
 * (index = tier × 2), so light/dark both work.
 */

const ROW_H = 22
const PAD_TOP = 8
const PAD_BOTTOM = 24
const GUTTER_L = 148
const GUTTER_R = 108
const WIDTH = 700

const fmtPct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`

/** Map a tier band (0…3 in 0.5 steps) to its palette var; null → neutral. */
function tierColor(tier: ArchetypeRowDTO['tier']): string {
  if (tier === null) return 'var(--color-chart-neutral)'
  const idx = Math.round(tier * 2) // 0,0.5,1,1.5,2,2.5,3 → 0..6
  return `var(--color-tier-${idx})`
}

function tierLabel(tier: ArchetypeRowDTO['tier']): string {
  return tier === null ? '—' : `Tier ${tier}`
}

export function TierChart({
  rows,
  title = 'Tier Rankings',
}: {
  rows: ArchetypeRowDTO[]
  title?: string
}) {
  const sorted = [...rows]
    .filter(r => Number.isFinite(r.wrLo))
    .sort((a, b) => b.wrLo - a.wrLo)

  if (sorted.length === 0) {
    return <div className="text-muted-foreground text-sm">No tier data.</div>
  }

  const los = sorted.map(r => r.wrLo)
  const dataMin = Math.min(...los)
  const dataMax = Math.max(...los)
  const pad = Math.max(0.01, (dataMax - dataMin) * 0.05)
  const xmin = Math.max(0, dataMin - pad)
  const xmax = Math.min(1, dataMax + pad)

  const plotL = GUTTER_L
  const plotR = WIDTH - GUTTER_R
  const height = PAD_TOP + sorted.length * ROW_H + PAD_BOTTOM

  const xScale = (v: number) =>
    plotL + ((v - xmin) / (xmax - xmin || 1)) * (plotR - plotL)

  const ticks = [xmin, (xmin + xmax) / 2, xmax]

  return (
    <figure className="w-full overflow-x-auto">
      <figcaption className="text-foreground mb-2 text-sm font-semibold">
        {title}
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        role="img"
        aria-label={title}
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {ticks.map(t => (
          <text
            key={t}
            x={xScale(t)}
            y={height - PAD_BOTTOM + 14}
            textAnchor="middle"
            fontSize={9}
            fill="var(--color-muted-foreground)"
          >
            {fmtPct(t, 0)}
          </text>
        ))}
        {sorted.map((r, i) => {
          const cy = PAD_TOP + i * ROW_H + ROW_H / 2
          const color = tierColor(r.tier)
          return (
            <g key={r.slug}>
              <title>{`${r.name}: ${tierLabel(r.tier)} · lo ${fmtPct(
                r.wrLo
              )}`}</title>
              <text
                x={plotL - 8}
                y={cy + 3}
                textAnchor="end"
                fontSize={9}
                fill={
                  r.isBucket
                    ? 'var(--color-muted-foreground)'
                    : 'var(--color-foreground)'
                }
              >
                {r.name.length > 24 ? r.name.slice(0, 23) + '…' : r.name}
              </text>
              <line
                x1={plotL}
                x2={plotR}
                y1={cy}
                y2={cy}
                stroke="var(--color-border)"
                strokeDasharray="2 3"
              />
              <circle
                cx={xScale(r.wrLo)}
                cy={cy}
                r={4}
                style={{ fill: color }}
              />
              <text
                x={plotR + 6}
                y={cy + 3}
                fontSize={8.5}
                fontWeight={600}
                fill="var(--color-foreground)"
              >
                {fmtPct(r.wrLo)}
              </text>
              <text
                x={plotR + 44}
                y={cy + 3}
                fontSize={8.5}
                fontWeight={700}
                style={{ fill: color }}
              >
                {tierLabel(r.tier)}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export default TierChart
