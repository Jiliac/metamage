import * as React from 'react'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// KpiStat — the spike's KPI tile (§9): a mono value over a letterspaced,
// uppercase label. Tiles join into a hairline grid (1px gap over --line) via
// <KpiStatGroup>. Server-renderable (no client hooks). Window totals:
// tournaments / decks / matches.
// ---------------------------------------------------------------------------

export type KpiStatProps = {
  /** Uppercase caption below the value (e.g. 'Tournaments'). */
  label: string
  /** The headline figure. Numbers are thousands-grouped unless `format` given. */
  value: string | number
  /** Override number formatting (ignored when `value` is already a string). */
  format?: (n: number) => string
  className?: string
}

/** One KPI tile. Compose several inside <KpiStatGroup> for the joined grid. */
export function KpiStat({ label, value, format, className }: KpiStatProps) {
  const display =
    typeof value === 'number'
      ? (format ?? ((n: number) => n.toLocaleString('en-US')))(value)
      : value
  return (
    <div className={cn('bg-surface px-[18px] pt-3.5 pb-3', className)}>
      <div className="num text-ink text-[26px] leading-none font-semibold tracking-[-0.01em]">
        {display}
      </div>
      <div className="text-ink-3 mt-1.5 text-[11.5px] tracking-[0.14em] uppercase">
        {label}
      </div>
    </div>
  )
}

export type KpiStatGroupProps = {
  children: React.ReactNode
  /** Column count for the joined grid (default 3, the window-totals triad). */
  columns?: number
  className?: string
}

/**
 * Joined hairline grid wrapper — the tiles sit on a `--line` background with a
 * 1px gap so the seams read as ledger rules, exactly like the spike's `.kpis`.
 */
export function KpiStatGroup({
  children,
  columns = 3,
  className,
}: KpiStatGroupProps) {
  return (
    <div
      className={cn('bg-line border-line grid gap-px border', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  )
}

export default KpiStat
