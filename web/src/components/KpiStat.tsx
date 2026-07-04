import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type KpiStatProps = {
  label: string
  value: ReactNode
  /** Optional sub-line beneath the value (e.g. a delta or denominator). */
  hint?: string
  className?: string
}

/**
 * A single KPI tile: small label above a large value. Plain div tile per
 * blueprint §4 — used in the KpiStat row on the meta overview / archetype pages.
 */
export function KpiStat({ label, value, hint, className }: KpiStatProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border bg-card p-4',
        className
      )}
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-2xl leading-none font-semibold tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}
