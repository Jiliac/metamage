'use client'

import * as React from 'react'
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

import { ManaPips } from '@/components/ManaPips'
import { cn } from '@/lib/utils'
import { wrPolarity, type WrPolarity } from '@/lib/stats'
import type { ArchetypeRowDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// WrPresenceScatter (blueprint §4) — a genuinely 2D encoding, so Recharts.
// x = metagame presence on a √ scale; y = win rate. Dots are NUMBERED by the
// archetype's presence rank (identity, §9 rule 3) and colored by where the 95%
// CI sits relative to 50% (--good above / --bad below / --mid straddling — never
// raw red/green). A plain <ol> side legend carries rank dot + name + ManaPips.
// ---------------------------------------------------------------------------

const POLE_VAR: Record<WrPolarity, string> = {
  good: 'var(--good)',
  bad: 'var(--bad)',
  mid: 'var(--mid)',
}

type ScatterDatum = {
  x: number // presence %, 0..100
  y: number // win rate %, 0..100
  rank: number
  slug: string
  name: string
  color: string | null
  matches: number
  wrLo: number
  wrHi: number
  pol: WrPolarity
}

type DotShapeProps = {
  cx?: number
  cy?: number
  payload?: ScatterDatum
}

function NumberedDot({ cx, cy, payload }: DotShapeProps) {
  if (cx == null || cy == null || !payload) return null
  return (
    <g className="mm-scatter-dot">
      <circle
        cx={cx}
        cy={cy}
        r={11}
        fill={POLE_VAR[payload.pol]}
        stroke="var(--surface)"
        strokeWidth={2}
      />
      <text
        x={cx}
        y={cy + 3.5}
        textAnchor="middle"
        fill="var(--bg)"
        fontSize={10}
        fontWeight={700}
        style={{ fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}
      >
        {payload.rank}
      </text>
    </g>
  )
}

type ScatterTipProps = {
  active?: boolean
  payload?: Array<{ payload: ScatterDatum }>
}

function ScatterTip({ active, payload }: ScatterTipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-ink text-bg max-w-[260px] px-2.5 py-1.5 text-xs leading-snug shadow-md">
      <b>
        {d.rank}. {d.name}
      </b>
      <div>
        {d.y.toFixed(1)}% over {d.matches} matches
      </div>
      <div className="opacity-75">
        CI {(d.wrLo * 100).toFixed(1)}–{(d.wrHi * 100).toFixed(1)} ·{' '}
        {d.x.toFixed(1)}% of meta
      </div>
    </div>
  )
}

export type WrPresenceScatterProps = {
  rows: ArchetypeRowDTO[]
  /** Only plot rows at or above this many matches (spike: 30). */
  minMatches?: number
  className?: string
}

export function WrPresenceScatter({
  rows,
  minMatches = 30,
  className,
}: WrPresenceScatterProps) {
  const points = React.useMemo<ScatterDatum[]>(
    () =>
      rows
        .filter(r => r.matches >= minMatches)
        .map(r => ({
          x: r.share * 100,
          y: r.wr * 100,
          rank: r.presenceRank,
          slug: r.slug,
          name: r.name,
          color: r.color,
          matches: r.matches,
          wrLo: r.wrLo,
          wrHi: r.wrHi,
          pol: wrPolarity(r.wrLo, r.wrHi),
        })),
    [rows, minMatches]
  )

  const legend = React.useMemo(
    () => [...points].sort((a, b) => a.rank - b.rank),
    [points]
  )

  const xMax = React.useMemo(() => {
    const m = Math.max(1, ...points.map(p => p.x))
    return Math.ceil(m / 5) * 5
  }, [points])

  const [yMin, yMax] = React.useMemo(() => {
    const lo = Math.min(50, ...points.map(p => p.y))
    const hi = Math.max(50, ...points.map(p => p.y))
    return [Math.floor((lo - 2) / 5) * 5, Math.ceil((hi + 2) / 5) * 5]
  }, [points])

  const xTicks = [1, 5, 10, 15, 20, 25, 30].filter(t => t <= xMax)

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-[230px_1fr] border border-line bg-surface shadow-ledger',
        className
      )}
    >
      <style>
        {
          '@media (prefers-reduced-motion: no-preference){.mm-scatter-dot{animation:mm-pop .45s cubic-bezier(.2,.9,.3,1.4) backwards}@keyframes mm-pop{from{opacity:0;transform:scale(.4)}}}'
        }
      </style>
      <div className="border-b border-line p-4 md:border-b-0 md:border-r">
        <ol className="m-0 list-none p-0 text-[12.5px]">
          {legend.map(d => (
            <li
              key={d.slug}
              className="flex items-center gap-2 py-[3.5px] text-ink-2"
            >
              <span
                className="data grid size-[17px] flex-none place-items-center rounded-full text-[9.5px] font-bold text-bg"
                style={{ background: POLE_VAR[d.pol] }}
              >
                {d.rank}
              </span>
              <span>{d.name}</span>
              <ManaPips colors={d.color} size={13} />
            </li>
          ))}
        </ol>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={430}>
          <ScatterChart margin={{ top: 16, right: 18, bottom: 24, left: 4 }}>
            <CartesianGrid stroke="var(--line)" />
            <XAxis
              type="number"
              dataKey="x"
              scale="sqrt"
              domain={[0, xMax]}
              ticks={xTicks}
              tickFormatter={v => `${v}%`}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              stroke="var(--line)"
              label={{
                value: 'PRESENCE · √ SCALE',
                position: 'bottom',
                offset: 8,
                style: {
                  fill: 'var(--ink-2)',
                  fontSize: 11,
                  letterSpacing: '0.1em',
                },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[yMin, yMax]}
              tickFormatter={v => `${v}%`}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              stroke="var(--line)"
              width={44}
            />
            <ReferenceLine
              y={50}
              stroke="var(--ref)"
              strokeDasharray="7 5"
              strokeWidth={1.5}
            />
            <Tooltip
              cursor={{ stroke: 'var(--line-strong)' }}
              content={<ScatterTip />}
            />
            <Scatter
              data={points}
              shape={<NumberedDot />}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default WrPresenceScatter
