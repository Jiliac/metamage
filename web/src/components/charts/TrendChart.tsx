'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MetaChangeDTO, TrendPointDTO } from '@/datasource/types'

/**
 * TrendChart — Recharts dual-line time series (blueprint §4).
 *
 * Two lines over weekly buckets: presence% (left axis, warm) and win rate
 * (right axis, cool). Zero-game weeks carry a `null` wr and render as a gap
 * (`connectNulls={false}`). Meta changes (bans / set releases) annotate the
 * timeline as dashed `ReferenceLine`s. Palette from theme vars for light/dark.
 */

const fmtPct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

type Row = {
  weekStart: string
  presencePct: number
  wr: number | null
  games: number
}

function TrendTooltip(props: {
  active?: boolean
  label?: string
  payload?: Array<{ payload: Row }>
}) {
  if (!props.active || !props.payload?.length) return null
  const p = props.payload[0].payload
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-2 py-1 text-xs shadow-md">
      <div className="font-semibold">{p.weekStart}</div>
      <div className="text-muted-foreground">
        {fmtPct(p.presencePct)} presence
      </div>
      <div className="text-muted-foreground">
        {p.wr == null ? 'no games' : `${fmtPct(p.wr, 1)} WR`} · {p.games} games
      </div>
    </div>
  )
}

export function TrendChart({
  points,
  changes = [],
  title = 'Trend',
}: {
  points: TrendPointDTO[]
  changes?: MetaChangeDTO[]
  title?: string
}) {
  const data: Row[] = points.map(p => ({
    weekStart: p.weekStart,
    presencePct: p.presencePct,
    wr: p.wr,
    games: p.games,
  }))

  if (data.length === 0) {
    return <div className="text-muted-foreground text-sm">No trend data.</div>
  }

  const weeks = new Set(data.map(d => d.weekStart))
  // Only annotate changes whose date lines up with a plotted week bucket.
  const marks = changes.filter(c => weeks.has(c.date))

  return (
    <figure className="w-full">
      <figcaption className="text-foreground mb-2 text-sm font-semibold">
        {title}
      </figcaption>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
          >
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="weekStart"
              tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
              stroke="var(--color-border)"
            />
            <YAxis
              yAxisId="presence"
              tickFormatter={(v: number) => fmtPct(v)}
              tick={{ fontSize: 9, fill: 'var(--color-chart-warm)' }}
              stroke="var(--color-chart-warm)"
              width={40}
            />
            <YAxis
              yAxisId="wr"
              orientation="right"
              domain={[0, 1]}
              tickFormatter={(v: number) => fmtPct(v)}
              tick={{ fontSize: 9, fill: 'var(--color-chart-cool)' }}
              stroke="var(--color-chart-cool)"
              width={40}
            />
            <ReferenceLine
              yAxisId="wr"
              y={0.5}
              stroke="var(--color-chart-reference)"
              strokeDasharray="5 4"
              strokeOpacity={0.5}
            />
            {marks.map(c => (
              <ReferenceLine
                key={`${c.date}-${c.type}`}
                yAxisId="presence"
                x={c.date}
                stroke="var(--color-chart-reference)"
                strokeDasharray="2 3"
                label={{
                  value: c.type === 'BAN' ? 'ban' : 'set',
                  fontSize: 9,
                  fill: 'var(--color-chart-reference)',
                  position: 'top',
                }}
              />
            ))}
            <Tooltip content={<TrendTooltip />} />
            <Line
              yAxisId="presence"
              type="monotone"
              dataKey="presencePct"
              stroke="var(--color-chart-warm)"
              strokeWidth={2}
              dot={false}
              name="Presence"
            />
            <Line
              yAxisId="wr"
              type="monotone"
              dataKey="wr"
              stroke="var(--color-chart-cool)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              name="Win rate"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export default TrendChart
