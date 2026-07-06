import * as React from 'react'

import { ManaPips } from '@/components/ManaPips'
import { cn } from '@/lib/utils'
import type { ArchetypeRowDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// WrCiChart (blueprint §4) — a 1D point-and-whisker (forest) plot, hand-rolled
// from divs (simpler than fighting Recharts' ErrorBar). Rows are sorted by the
// canonical ranking key `wrLo` (the moat). Each row draws the 95% CI whisker
// [wrLo, wrHi] with the win-rate point on top, colored by where the interval
// sits vs 50% (--good / --bad / --mid — never raw red/green). A dashed --ref
// line marks 50%. Pure CSS % positioning → responsive with no distortion.
// ---------------------------------------------------------------------------

type Polarity = 'good' | 'bad' | 'mid'
const POLE_VAR: Record<Polarity, string> = {
  good: 'var(--good)',
  bad: 'var(--bad)',
  mid: 'var(--mid)',
}
function polarity(wrLo: number, wrHi: number): Polarity {
  if (wrLo > 0.5) return 'good'
  if (wrHi < 0.5) return 'bad'
  return 'mid'
}

export type WrCiChartProps = {
  rows: ArchetypeRowDTO[]
  className?: string
}

export function WrCiChart({ rows, className }: WrCiChartProps) {
  const sorted = React.useMemo(
    () => [...rows].sort((a, b) => b.wrLo - a.wrLo),
    [rows]
  )

  // Data-driven domain (fractions), padded, always containing 0.5.
  const lo = Math.min(0.5, ...sorted.map(r => r.wrLo))
  const hi = Math.max(0.5, ...sorted.map(r => r.wrHi))
  const pad = Math.max(0.02, (hi - lo) * 0.08)
  const domLo = Math.max(0, lo - pad)
  const domHi = Math.min(1, hi + pad)
  const span = domHi - domLo || 1
  const sx = (v: number): number => ((v - domLo) / span) * 100

  // Ticks every 5% within the domain.
  const ticks: number[] = []
  for (let t = Math.ceil((domLo * 100) / 5) * 5; t <= domHi * 100; t += 5) {
    ticks.push(t)
  }

  const refAt = sx(0.5)

  return (
    <div className={cn('w-full', className)}>
      {sorted.map(r => {
        const pol = polarity(r.wrLo, r.wrHi)
        const left = sx(r.wrLo)
        const width = sx(r.wrHi) - sx(r.wrLo)
        const at = sx(r.wr)
        return (
          <div
            key={r.slug}
            className={cn(
              'grid items-center gap-3 border-b border-line py-2 last:border-b-0',
              'grid-cols-[190px_1fr]',
              r.isBucket && 'opacity-60'
            )}
          >
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="data w-5 flex-none text-right text-[11px] text-ink-3">
                {r.presenceRank}
              </span>
              <ManaPips colors={r.color} size={13} />
              <span className="truncate font-semibold">{r.name}</span>
            </div>
            <div
              className="relative h-5"
              role="img"
              aria-label={`${r.name}: win rate ${(r.wr * 100).toFixed(1)}%, 95% CI ${(r.wrLo * 100).toFixed(1)} to ${(r.wrHi * 100).toFixed(1)}`}
            >
              {/* 50% reference */}
              <span
                className="absolute inset-y-0"
                style={{
                  left: `${refAt}%`,
                  borderLeft: '1px dashed var(--ref)',
                }}
              />
              {/* whisker */}
              <span
                className="absolute top-1/2 h-[2px] -translate-y-1/2"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(0, width)}%`,
                  background: POLE_VAR[pol],
                  opacity: 0.55,
                }}
              />
              {/* point */}
              <span
                className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${at}%`,
                  background: POLE_VAR[pol],
                  boxShadow: '0 0 0 1.5px var(--surface)',
                }}
              />
            </div>
          </div>
        )
      })}
      {/* axis */}
      <div className="grid grid-cols-[190px_1fr] gap-3 pt-1.5">
        <div />
        <div className="relative h-4">
          {ticks.map(t => (
            <span
              key={t}
              className="data absolute -translate-x-1/2 text-[10px] text-ink-3"
              style={{ left: `${sx(t / 100)}%` }}
            >
              {t}%
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default WrCiChart
