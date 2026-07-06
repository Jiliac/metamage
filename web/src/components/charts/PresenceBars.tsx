import * as React from 'react'

import { ManaPips } from '@/components/ManaPips'
import { cn } from '@/lib/utils'
import type { ArchetypeRowDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// PresenceBars (blueprint §4) — a trivial 1D encoding, hand-rolled from divs so
// there is no chart-lib runtime cost. Bars use the spike's ledger "sharebar"
// treatment: a --raised track, a --gold-soft fill, and a hard --gold cap at the
// bar's leading edge. Gold = structure (§9 rule 1), so presence is never a
// polarity color. Weighting (match vs entry) is the caller's concern — this just
// paints whatever `share` the row carries. (Piecewise x-compression deferred:
// the skeleton axis is linear.)
// ---------------------------------------------------------------------------

export type PresenceBarsProps = {
  rows: ArchetypeRowDTO[]
  className?: string
}

export function PresenceBars({ rows, className }: PresenceBarsProps) {
  const max = Math.max(0.0001, ...rows.map(r => r.share))

  return (
    <div className={cn('flex flex-col', className)}>
      {rows.map(r => {
        const w = Math.max(0, (r.share / max) * 100)
        return (
          <div
            key={r.slug}
            className={cn(
              'flex items-center gap-3 border-b border-line py-1.5 last:border-b-0',
              r.isBucket && 'opacity-60'
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
              <span className="data w-5 flex-none text-right text-[11px] text-ink-3">
                {r.presenceRank}
              </span>
              <ManaPips colors={r.color} size={14} />
              <span className="truncate font-semibold">{r.name}</span>
            </div>
            <div
              className="relative h-3.5 flex-1"
              style={{ background: 'var(--raised)' }}
              role="img"
              aria-label={`${r.name}: ${(r.share * 100).toFixed(1)}% of matches`}
            >
              <div
                className="absolute inset-y-0.5 left-0.5"
                style={{
                  width: `calc(${w.toFixed(2)}% - 2px)`,
                  background: 'var(--gold-soft)',
                }}
              >
                <span
                  className="absolute inset-y-0 right-0 w-[3px]"
                  style={{ background: 'var(--gold)' }}
                />
              </div>
            </div>
            <span className="data w-14 flex-none text-right text-[12px] text-ink-2">
              {(r.share * 100).toFixed(1)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default PresenceBars
