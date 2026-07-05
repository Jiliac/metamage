import * as React from 'react'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// BucketBadge — marks the `unknown` / `conflict` catch-all rows (§7, §3:
// isBucket → de-emphasize; never in tier math). A muted, outlined chip in the
// ledger's `.tier.t2` key so a bucket never competes with a real archetype for
// attention. Server-renderable.
// ---------------------------------------------------------------------------

export type BucketBadgeProps = {
  /** Which catch-all this is; drives the label. Defaults to a generic chip. */
  kind?: 'unknown' | 'conflict' | (string & {})
  className?: string
}

export function BucketBadge({ kind, className }: BucketBadgeProps) {
  const label = kind ? kind.toUpperCase() : 'BUCKET'
  return (
    <span
      className={cn(
        'border-line-strong text-ink-3 inline-block border px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em] uppercase',
        className
      )}
      title="Catch-all bucket — excluded from tier math"
    >
      {label}
    </span>
  )
}

export default BucketBadge
