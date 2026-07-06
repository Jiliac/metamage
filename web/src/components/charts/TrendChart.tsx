'use client'

import * as React from 'react'
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

import { cn } from '@/lib/utils'
import type { MetaChangeDTO, TrendPointDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// TrendChart (blueprint §4) — a 2D time series, so Recharts. Dual line:
// presence % (gold, left axis — structure) and win rate % (ink, right axis),
// with a dashed --ref line at 50% and vertical ReferenceLines annotating meta
// changes (bans / set releases). Win-rate gaps (zero-game weeks) stay broken —
// `connectNulls={false}` — so the eye never invents data across an empty week.
// ---------------------------------------------------------------------------

type TrendDatum = {
  week: string
  presence: number // %, 0..100
  wr: number | null // %, 0..100, null = gap
  games: number
}

const shortDate = (iso: string): string => {
  // 'YYYY-MM-DD' → 'M/D', avoiding timezone drift from Date parsing.
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

type TrendTipProps = {
  active?: boolean
  label?: string | number
  payload?: Array<{ payload: TrendDatum }>
}

function TrendTip({ active, payload }: TrendTipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-ink text-bg max-w-[240px] px-2.5 py-1.5 text-xs leading-snug shadow-md">
      <b>Week of {shortDate(d.week)}</b>
      <div>Presence {d.presence.toFixed(1)}%</div>
      <div className="opacity-75">
        {d.wr == null
          ? 'No games this week'
          : `WR ${d.wr.toFixed(1)}% over ${d.games} games`}
      </div>
    </div>
  )
}

export type TrendChartProps = {
  trends: TrendPointDTO[]
  /** Meta changes to annotate as vertical reference lines. */
  changes?: MetaChangeDTO[]
  className?: string
}

export function TrendChart({ trends, changes, className }: TrendChartProps) {
  const data = React.useMemo<TrendDatum[]>(
    () =>
      trends.map(t => ({
        week: t.weekStart,
        presence: t.presencePct * 100,
        wr: t.wr == null ? null : t.wr * 100,
        games: t.games,
      })),
    [trends]
  )

  const weeks = React.useMemo(() => new Set(data.map(d => d.week)), [data])
  const marks = React.useMemo(
    () => (changes ?? []).filter(c => weeks.has(c.date)),
    [changes, weeks]
  )

  return (
    <div
      className={cn(
        'border border-line bg-surface p-3 shadow-ledger',
        className
      )}
    >
      <ResponsiveContainer width="100%" height={340}>
        <LineChart
          data={data}
          margin={{ top: 16, right: 12, bottom: 8, left: 4 }}
        >
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="week"
            tickFormatter={shortDate}
            tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
            stroke="var(--line)"
          />
          <YAxis
            yAxisId="presence"
            tickFormatter={v => `${v}%`}
            tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
            stroke="var(--line)"
            width={44}
            label={{
              value: 'PRESENCE',
              angle: -90,
              position: 'insideLeft',
              style: {
                fill: 'var(--gold)',
                fontSize: 10,
                letterSpacing: '0.1em',
              },
            }}
          />
          <YAxis
            yAxisId="wr"
            orientation="right"
            domain={[35, 65]}
            tickFormatter={v => `${v}%`}
            tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
            stroke="var(--line)"
            width={44}
            label={{
              value: 'WIN RATE',
              angle: 90,
              position: 'insideRight',
              style: {
                fill: 'var(--ink-2)',
                fontSize: 10,
                letterSpacing: '0.1em',
              },
            }}
          />
          <ReferenceLine
            yAxisId="wr"
            y={50}
            stroke="var(--ref)"
            strokeDasharray="7 5"
          />
          {marks.map(c => (
            <ReferenceLine
              key={c.date}
              yAxisId="presence"
              x={c.date}
              stroke="var(--gold-soft)"
              strokeDasharray="4 4"
              label={{
                value: c.type === 'BAN' ? 'ban' : 'set',
                position: 'top',
                style: { fill: 'var(--gold)', fontSize: 10 },
              }}
            />
          ))}
          <Tooltip content={<TrendTip />} />
          <Line
            yAxisId="presence"
            type="monotone"
            dataKey="presence"
            stroke="var(--gold)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: 'var(--gold)', strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="wr"
            type="monotone"
            dataKey="wr"
            stroke="var(--ink-2)"
            strokeWidth={2}
            strokeDasharray="5 3"
            connectNulls={false}
            dot={{ r: 2.5, fill: 'var(--ink-2)', strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default TrendChart
