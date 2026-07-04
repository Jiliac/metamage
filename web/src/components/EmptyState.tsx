import type { ReactNode } from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type EmptyStateProps = {
  title?: string
  description?: string
  /** Custom icon; defaults to an inbox glyph. */
  icon?: ReactNode
  /** CTA label — paired with `actionHref`. */
  actionLabel?: string
  /** CTA target — typically the same view with a wider window. */
  actionHref?: string
  /** Fully custom action node (overrides `actionLabel` / `actionHref`). */
  action?: ReactNode
  className?: string
}

/**
 * Friendly empty-window state. Defaults nudge the user to widen the date window,
 * the most common reason a metagame view comes back empty. Drives the empty-window
 * fixture across every view.
 */
export function EmptyState({
  title = 'No data in this window',
  description = 'No tournaments were recorded for the selected dates. Try widening the window or picking a different format.',
  icon,
  actionLabel = 'Widen the window',
  actionHref,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center',
        className
      )}
    >
      <div className="text-muted-foreground">
        {icon ?? <Inbox className="size-8" aria-hidden />}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {action ??
        (actionHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : null)}
    </div>
  )
}
