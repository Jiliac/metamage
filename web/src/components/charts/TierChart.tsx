import * as React from 'react'

import { ManaPips } from '@/components/ManaPips'
import { cn } from '@/lib/utils'
import { wrPolarity, type WrPolarity } from '@/lib/stats'
import type { ArchetypeRowDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// TierChart / TierBadge (blueprint §4) — 1D tier bands, hand-rolled from divs.
// Each archetype wears its std-dev tier chip (spike treatment: T1 = solid gold,
// mid tiers = gold outline, low tiers = muted) plus a rank dot colored by win-
// rate polarity (--good / --bad / --mid). Gold on the chip is structure, not a
// value (§9 rule 1). Rows are ordered best tier first, then by `wrLo`; buckets
// and untiered rows fall to an "Unranked" group at the end.
// ---------------------------------------------------------------------------

const POLE_VAR: Record<WrPolarity, string> = {
  good: 'var(--good)',
  bad: 'var(--bad)',
  mid: 'var(--mid)',
}

/** Tier chip styling — best bands solid gold, then gold outline, then muted. */
function tierChipStyle(tier: number): React.CSSProperties {
  if (tier <= 1) {
    return {
      background: 'var(--gold)',
      color: 'var(--bg)',
      borderColor: 'var(--gold)',
    }
  }
  if (tier === 1.5) {
    return { color: 'var(--gold)', borderColor: 'var(--gold-soft)' }
  }
  return { color: 'var(--ink-3)', borderColor: 'var(--line-strong)' }
}

export function TierBadge({
  tier,
  className,
}: {
  tier: ArchetypeRowDTO['tier']
  className?: string
}) {
  // Display bands 1-based (best = T1) to match the spike + MTG convention; the
  // stored band stays 0-based for the tier math (§9, no "T0").
  const label = tier == null ? '—' : `T${tier + 1}`
  const style =
    tier == null
      ? { color: 'var(--ink-3)', borderColor: 'var(--line-strong)' }
      : tierChipStyle(tier)
  return (
    <span
      className={cn(
        'inline-block border px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em]',
        className
      )}
      style={style}
    >
      {label}
    </span>
  )
}

export type TierChartProps = {
  rows: ArchetypeRowDTO[]
  className?: string
}

export function TierChart({ rows, className }: TierChartProps) {
  const sorted = React.useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ta = a.tier ?? Number.POSITIVE_INFINITY
        const tb = b.tier ?? Number.POSITIVE_INFINITY
        if (ta !== tb) return ta - tb
        return b.wrLo - a.wrLo
      }),
    [rows]
  )

  return (
    <div className={cn('flex flex-col', className)}>
      {sorted.map(r => {
        const pol = wrPolarity(r.wrLo, r.wrHi)
        return (
          <div
            key={r.slug}
            className={cn(
              'flex items-center gap-3 border-b border-line py-1.5 last:border-b-0',
              r.isBucket && 'opacity-60'
            )}
          >
            <TierBadge tier={r.tier} className="w-11 flex-none text-center" />
            <span
              className="size-[13px] flex-none rounded-full"
              style={{ background: POLE_VAR[pol] }}
              aria-hidden
            />
            <ManaPips colors={r.color} size={13} />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
              {r.name}
            </span>
            <span
              className="data flex-none text-[13px] font-bold"
              style={{ color: POLE_VAR[pol] }}
            >
              {(r.wr * 100).toFixed(1)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default TierChart
