import * as React from 'react'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// LowSampleNotice — the subtle "read this with care" line for thin windows /
// wide intervals (§9: confidence = ink; under-sampled claims are hedged, not
// hidden). Small, ink-3, a single gold dot for structure. Server-renderable.
// ---------------------------------------------------------------------------

export type LowSampleNoticeProps = {
  /** Match (or game) count behind the figure the caller is qualifying. */
  matches: number
  /** Optional floor for context (e.g. the 80-match default threshold). */
  threshold?: number
  /** Noun for the sample unit. Default 'matches'. */
  unit?: string
  className?: string
}

export function LowSampleNotice({
  matches,
  threshold,
  unit = 'matches',
  className,
}: LowSampleNoticeProps) {
  return (
    <p
      className={cn(
        'text-ink-3 inline-flex items-center gap-2 text-[11.5px]',
        className
      )}
    >
      <span
        aria-hidden
        className="bg-gold inline-block size-1.5 flex-none rounded-full opacity-80"
      />
      <span>
        Thin sample —{' '}
        <span className="num text-ink-2">
          {matches.toLocaleString('en-US')} {unit}
        </span>
        {threshold !== undefined && matches < threshold ? (
          <>, below the {threshold.toLocaleString('en-US')} floor</>
        ) : null}
        . The interval is wide; read the win rate with care.
      </span>
    </p>
  )
}

export default LowSampleNotice
