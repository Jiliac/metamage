import * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// EmptyState — the friendly "nothing in this window" panel (§5: the empty-window
// fixture drives this on every view). Editorial voice + a widen-the-window CTA
// so the dead end is one click from data. Cut chrome (notched panel), gold CTA
// in the lens key. Server-renderable.
// ---------------------------------------------------------------------------

export type EmptyStateProps = {
  /** Short eyebrow above the headline (gold, tracked). */
  eyebrow?: string
  /** Editorial headline. */
  title?: string
  /** Supporting sentence under the headline. */
  message?: string
  /** If given, renders the primary "widen the window" link. */
  widenHref?: string
  /** Label for the widen CTA. */
  widenLabel?: string
  /** Extra actions (e.g. clear filters) rendered beside the widen CTA. */
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  eyebrow = 'Nothing here yet',
  title = 'No tournaments in this window',
  message = 'The ledger is empty for the dates and filters you picked. Widen the window or loosen the floor to bring the field back into view.',
  widenHref,
  widenLabel = 'Widen the window',
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'bg-surface border-line clip-notch shadow-ledger border px-8 py-12 text-center',
        className
      )}
    >
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h2 className="font-display text-ink mx-auto max-w-[34ch] text-[23px] leading-tight font-bold text-balance">
        {title}
      </h2>
      <p className="text-ink-2 mx-auto mt-3 max-w-[52ch] text-[13.5px]">
        {message}
      </p>
      {(widenHref || action) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {widenHref && (
            <Link
              href={widenHref}
              className="border-gold-soft text-gold hover:bg-gold-wash inline-flex items-center border px-3 py-1.5 text-[13px] tracking-[0.02em]"
            >
              {widenLabel}
            </Link>
          )}
          {action}
        </div>
      )}
    </div>
  )
}

export default EmptyState
