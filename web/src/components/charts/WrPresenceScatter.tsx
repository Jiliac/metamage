'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { usePlotZoom } from '@/hooks/usePlotZoom'
import { niceTicks, sqrtTicks } from '@/lib/zoom'
import { cn } from '@/lib/utils'
import type { ArchetypeRowDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// WrPresenceScatter (blueprint §4) — a genuinely 2D encoding, so Recharts.
// x = metagame presence on a √ scale; y = win rate. Dots are NUMBERED by the
// archetype's presence rank (identity, §9 rule 3) and colored on a continuous
// ramp by win rate: --bad at the bottom of the band, --good at the top, mixed
// in between (never raw red/green). A plain <ol> legend carries rank dot +
// name + ManaPips. The plot zooms (usePlotZoom): pinch or ctrl-scroll to
// spread a crowded pack, drag to pan, double-tap or Reset to go back; dots
// keep their size, so a zoom separates them instead of magnifying them.
// ---------------------------------------------------------------------------

/** Win-rate band the ramp spans: at or below 42% is full --bad, at or above
 *  58% full --good. The ramp runs through --gold at 50%, so the midpoint stays
 *  warm rather than the grey a straight --bad→--good mix passes through. */
const RAMP_LO = 42
const RAMP_HI = 58

/** Continuous dot fill for a win rate in percent: --bad → --gold → --good. */
function rampFill(wrPct: number): string {
  const t = Math.max(0, Math.min(1, (wrPct - RAMP_LO) / (RAMP_HI - RAMP_LO)))
  return t < 0.5
    ? `color-mix(in oklab, var(--gold) ${(t * 200).toFixed(0)}%, var(--bad))`
    : `color-mix(in oklab, var(--good) ${((t - 0.5) * 200).toFixed(0)}%, var(--gold))`
}

// Every ramp stop (--bad, --gold, --good) carries `--bg` numerals in both
// themes.
const badgeStyle = (wrPct: number): React.CSSProperties => ({
  background: rampFill(wrPct),
  color: 'var(--bg)',
})

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
  href?: string
}

type DotShapeProps = {
  cx?: number
  cy?: number
  payload?: ScatterDatum
  onNavigate?: (href: string) => void
  /** Phone sizing: smaller dots so the pack overlaps less. */
  compact?: boolean
}

function NumberedDot({ cx, cy, payload, onNavigate, compact }: DotShapeProps) {
  if (cx == null || cy == null || !payload) return null
  const href = payload.href
  const dot = (
    <g className="mm-scatter-dot">
      <circle
        cx={cx}
        cy={cy}
        r={compact ? 9 : 12}
        fill={rampFill(payload.y)}
        stroke="var(--surface)"
        strokeWidth={compact ? 1.5 : 2}
      />
      <text
        x={cx}
        y={cy + (compact ? 3.5 : 4)}
        textAnchor="middle"
        fill="var(--bg)"
        fontSize={compact ? 9.5 : 11}
        fontWeight={700}
        style={{ fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}
      >
        {payload.rank}
      </text>
    </g>
  )
  // Buckets (and rows without a detail page) carry no href: plain, inert dot.
  if (!href) return dot
  // A real SVG <a href> gives native focus, Enter activation, modifier-click
  // new tab and copy-link; plain left-clicks stay client-side navigations.
  return (
    <a
      href={href}
      className="mm-scatter-link"
      aria-label={`${payload.rank}. ${payload.name}`}
      style={{ cursor: 'pointer' }}
      onClick={e => {
        if (!onNavigate) return
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (e.button !== 0) return
        e.preventDefault()
        onNavigate(href)
      }}
    >
      {dot}
    </a>
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
  /** Precomputed slug → archetype detail href; dots + legend link when set. */
  rowHref?: Record<string, string>
  className?: string
}

export function WrPresenceScatter({
  rows,
  minMatches = 30,
  rowHref,
  className,
}: WrPresenceScatterProps) {
  const router = useRouter()
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
          href: rowHref?.[String(r.slug)],
        })),
    [rows, minMatches, rowHref]
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

  // Zoom works in the x axis's √ space so a pinch is even on screen.
  const full = React.useMemo(
    () => ({ u0: 0, u1: Math.sqrt(xMax), y0: yMin, y1: yMax }),
    [xMax, yMin, yMax]
  )
  const minSpan = React.useMemo(() => ({ u: full.u1 * 0.12, y: 3 }), [full.u1])
  const zoom = usePlotZoom(full, minSpan)
  const v = zoom.view
  const xDomain: [number, number] = zoom.zoomed
    ? [v.u0 * v.u0, v.u1 * v.u1]
    : [0, xMax]
  const yDomain: [number, number] = zoom.zoomed ? [v.y0, v.y1] : [yMin, yMax]
  const pctTick = (t: number) => `${Number.isInteger(t) ? t : t.toFixed(1)}%`

  // Fixed desktop height at ≥md, shorter below; SSR assumes desktop. Phones
  // also get smaller dots and slimmer margins so the pack spreads out.
  const isDesktop = useIsDesktop()
  const chartHeight = isDesktop ? 430 : 340

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-[230px_1fr] border border-line bg-surface shadow-ledger',
        className
      )}
    >
      <style>
        {
          '.mm-scatter-link:focus{outline:none}.mm-scatter-link:focus-visible circle{stroke:var(--gold);stroke-width:3}@media (prefers-reduced-motion: no-preference){.mm-scatter-dot{animation:mm-pop .45s cubic-bezier(.16,1,.3,1) backwards}@keyframes mm-pop{from{opacity:0;transform:scale(.6)}}}'
        }
      </style>
      {/* Legend: a side column at md+; below, it follows the chart as a
          two-column key so the plot lands first. */}
      <div className="max-md:order-2 border-t border-line px-4 py-3 md:border-t-0 md:border-r md:py-4">
        <ol className="m-0 grid list-none grid-cols-2 gap-x-4 p-0 text-[12.5px] md:grid-cols-1">
          {legend.map(d => (
            <li
              key={d.slug}
              className="flex min-w-0 items-center gap-2 py-1.5 md:py-[3.5px]"
            >
              <span
                className="data grid size-[19px] flex-none place-items-center rounded-full text-[11px] font-bold"
                style={badgeStyle(d.y)}
              >
                {d.rank}
              </span>
              {d.href ? (
                <Link
                  href={d.href}
                  className="min-w-0 text-ink-2 no-underline hover:text-gold hover:underline max-md:truncate"
                  style={{ textUnderlineOffset: 3 }}
                >
                  {d.name}
                </Link>
              ) : (
                <span className="min-w-0 max-md:truncate">{d.name}</span>
              )}
              <ManaPips
                colors={d.color}
                size={13}
                className="flex-none max-sm:hidden"
              />
            </li>
          ))}
        </ol>
      </div>
      <div className="relative p-3 max-md:order-1 max-md:px-1 max-md:pb-1">
        {zoom.zoomed && (
          <button
            type="button"
            onClick={zoom.reset}
            className="border-gold-soft text-gold hover:bg-gold-wash bg-surface absolute top-3 right-4 z-10 border px-2.5 py-1 text-[12px]"
          >
            Reset zoom
          </button>
        )}
        <div {...zoom.bind} className="select-none">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ScatterChart
              margin={
                isDesktop
                  ? { top: 16, right: 18, bottom: 24, left: 4 }
                  : { top: 10, right: 12, bottom: 22, left: 0 }
              }
            >
              <CartesianGrid stroke="var(--line)" />
              <XAxis
                type="number"
                dataKey="x"
                scale="sqrt"
                domain={xDomain}
                allowDataOverflow
                ticks={zoom.zoomed ? sqrtTicks(...xDomain) : xTicks}
                tickFormatter={pctTick}
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
                domain={yDomain}
                allowDataOverflow
                ticks={zoom.zoomed ? niceTicks(...yDomain) : undefined}
                tickFormatter={pctTick}
                tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
                stroke="var(--line)"
                width={isDesktop ? 44 : 36}
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
                shape={
                  <NumberedDot
                    onNavigate={href => router.push(href)}
                    compact={!isDesktop}
                  />
                }
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="text-ink-3 pt-1 text-center text-[11.5px]">
          {isDesktop
            ? 'Pinch the trackpad or ctrl-scroll to zoom · drag to pan · double-click to reset'
            : 'Pinch to zoom · drag to pan · double-tap to reset'}
        </p>
      </div>
    </div>
  )
}

export default WrPresenceScatter
