'use client'

import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ArchetypeRowDTO } from '@/datasource/types'

/**
 * WrPresenceScatter — Recharts scatter (genuinely 2D: sqrt-x share vs y wr).
 *
 * Numbered dots (numbered by presence rank) via a custom `shape`, a plain `<ol>`
 * side legend keyed to those numbers, a dashed 50% reference line, and
 * green/olive/red dot colouring by win-rate threshold (like the R chart).
 * Colours come from palette vars so light/dark both work.
 */

type Point = {
  idx: number
  slug: string
  name: string
  share: number
  wr: number
  color: string
  isBucket: boolean
}

const fmtPct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`

/** Green / olive / red by win-rate threshold, mirroring the R gradient poles. */
function wrColor(wr: number): string {
  if (wr >= 0.52) return 'var(--color-chart-good)'
  if (wr <= 0.48) return 'var(--color-chart-bad)'
  return 'var(--color-chart-neutral)'
}

function NumberedDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={9}
        style={{ fill: payload.color }}
        opacity={0.9}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight={700}
        fill="var(--color-background)"
      >
        {payload.idx}
      </text>
    </g>
  )
}

function ScatterTooltip(props: {
  active?: boolean
  payload?: Array<{ payload: Point }>
}) {
  if (!props.active || !props.payload?.length) return null
  const p = props.payload[0].payload
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-2 py-1 text-xs shadow-md">
      <div className="font-semibold">
        {p.idx}. {p.name}
      </div>
      <div className="text-muted-foreground">
        {fmtPct(p.share)} presence · {fmtPct(p.wr)} WR
      </div>
    </div>
  )
}

export function WrPresenceScatter({
  rows,
  title = 'Win Rate vs Presence',
}: {
  rows: ArchetypeRowDTO[]
  title?: string
}) {
  const points: Point[] = [...rows]
    .filter(r => Number.isFinite(r.wr) && Number.isFinite(r.share))
    .sort((a, b) => b.share - a.share)
    .map((r, i) => ({
      idx: r.presenceRank || i + 1,
      slug: r.slug,
      name: r.name,
      share: r.share,
      wr: r.wr,
      color: wrColor(r.wr),
      isBucket: r.isBucket,
    }))

  if (points.length === 0) {
    return <div className="text-muted-foreground text-sm">No data.</div>
  }

  return (
    <figure className="w-full">
      <figcaption className="text-foreground mb-2 text-sm font-semibold">
        {title}
      </figcaption>
      <div className="flex flex-col gap-4 sm:flex-row">
        <ol className="text-muted-foreground order-2 min-w-[9rem] space-y-0.5 text-xs sm:order-1">
          {points.map(p => (
            <li key={p.slug} className="flex items-center gap-1.5">
              <span
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  background: p.color,
                  color: 'var(--color-background)',
                }}
              >
                {p.idx}
              </span>
              <span
                className={
                  'truncate ' +
                  (p.isBucket
                    ? 'text-muted-foreground italic'
                    : 'text-foreground')
                }
              >
                {p.name}
              </span>
            </li>
          ))}
        </ol>
        <div className="order-1 h-64 flex-1 sm:order-2">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 20, left: 4 }}>
              <CartesianGrid
                stroke="var(--color-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                type="number"
                dataKey="share"
                scale="sqrt"
                domain={[0, 'dataMax']}
                tickFormatter={(v: number) => fmtPct(v, 0)}
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                stroke="var(--color-border)"
                label={{
                  value: 'Presence',
                  position: 'insideBottom',
                  offset: -12,
                  fontSize: 11,
                  fill: 'var(--color-muted-foreground)',
                }}
              />
              <YAxis
                type="number"
                dataKey="wr"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v: number) => fmtPct(v, 0)}
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                stroke="var(--color-border)"
                width={40}
              />
              <ReferenceLine
                y={0.5}
                stroke="var(--color-chart-reference)"
                strokeDasharray="5 4"
                strokeOpacity={0.6}
              />
              <Tooltip
                content={<ScatterTooltip />}
                cursor={{ strokeDasharray: '3 3' }}
              />
              <Scatter data={points} shape={<NumberedDot />} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  )
}

export default WrPresenceScatter
