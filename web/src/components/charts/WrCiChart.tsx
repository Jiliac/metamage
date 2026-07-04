'use client'

import type { ArchetypeRowDTO } from '@/datasource/types'

/**
 * WrCiChart — hand-rolled SVG point + whisker plot (blueprint §4).
 *
 * 1D encoding: rows sorted by the clustered lower bound `wrLo` (the canonical
 * ranking key). Each row draws a whisker `wrLo→wrHi` with the point estimate
 * `wr` on it, coloured by a red→green ramp over `wrLo`, plus a dashed 50%
 * reference line. Mirrors the R `plot_wr_ci`. Theme-aware via palette vars.
 */

const ROW_H = 22
const PAD_TOP = 10
const PAD_BOTTOM = 26
const GUTTER_L = 148
const GUTTER_R = 96
const WIDTH = 700

const fmtPct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

/** Red→green mix over the normalised `wrLo` position. */
function rampColor(frac: number): string {
  const p = Math.round(Math.max(0, Math.min(1, frac)) * 100)
  return `color-mix(in oklab, var(--color-chart-bad), var(--color-chart-good) ${p}%)`
}

export function WrCiChart({
  rows,
  title = 'Win Rates',
}: {
  rows: ArchetypeRowDTO[]
  title?: string
}) {
  const sorted = [...rows]
    .filter(r => Number.isFinite(r.wrLo) && Number.isFinite(r.wrHi))
    .sort((a, b) => b.wrLo - a.wrLo)

  if (sorted.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">No win-rate data.</div>
    )
  }

  const los = sorted.map(r => r.wrLo)
  const his = sorted.map(r => r.wrHi)
  const minLo = Math.min(...los)
  const maxLo = Math.max(...los)
  const dataMin = Math.min(...los)
  const dataMax = Math.max(...his)
  const pad = Math.max(0.01, (dataMax - dataMin) * 0.04)
  const xmin = Math.max(0, dataMin - pad)
  const xmax = Math.min(1, dataMax + pad)

  const plotL = GUTTER_L
  const plotR = WIDTH - GUTTER_R
  const height = PAD_TOP + sorted.length * ROW_H + PAD_BOTTOM

  const xScale = (v: number) =>
    plotL + ((v - xmin) / (xmax - xmin || 1)) * (plotR - plotL)

  const ticks = [xmin, (xmin + xmax) / 2, xmax]
  const showRef = xmin <= 0.5 && xmax >= 0.5

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
        {showRef && (
          <line
            x1={xScale(0.5)}
            x2={xScale(0.5)}
            y1={PAD_TOP}
            y2={height - PAD_BOTTOM}
            stroke="var(--color-chart-reference)"
            strokeDasharray="4 3"
            strokeOpacity={0.6}
          />
        )}
        {ticks.map(t => (
          <g key={t}>
            <text
              x={xScale(t)}
              y={height - PAD_BOTTOM + 14}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-muted-foreground)"
            >
              {fmtPct(t)}
            </text>
          </g>
        ))}
        {sorted.map((r, i) => {
          const cy = PAD_TOP + i * ROW_H + ROW_H / 2
          const frac = maxLo > minLo ? (r.wrLo - minLo) / (maxLo - minLo) : 0.5
          const color = rampColor(frac)
          return (
            <g key={r.slug}>
              <title>{`${r.name}: ${fmtPct(r.wr, 1)} (${fmtPct(
                r.wrLo
              )}–${fmtPct(r.wrHi)}) · ${r.wins}-${r.losses}-${r.draws}`}</title>
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
                x1={xScale(r.wrLo)}
                x2={xScale(r.wrHi)}
                y1={cy}
                y2={cy}
                strokeWidth={2}
                strokeLinecap="round"
                style={{ stroke: color }}
              />
              <circle cx={xScale(r.wr)} cy={cy} r={3} style={{ fill: color }} />
              <text
                x={plotR + 6}
                y={cy + 3}
                fontSize={8.5}
                fontWeight={600}
                fill="var(--color-foreground)"
              >
                {fmtPct(r.wr, 1)}
              </text>
              <text
                x={plotR + 42}
                y={cy + 3}
                fontSize={8}
                fill="var(--color-muted-foreground)"
              >
                {`${fmtPct(r.wrLo)}–${fmtPct(r.wrHi)}`}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export default WrCiChart
