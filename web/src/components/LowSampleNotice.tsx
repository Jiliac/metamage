import { TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

export type LowSampleNoticeProps = {
  /** Inline marker (next to a stat) vs. a standalone callout block. */
  inline?: boolean
  /** Optional game count to surface in the tooltip / body copy. */
  games?: number
  /** Override the default copy. */
  message?: string
  className?: string
}

const DEFAULT_MESSAGE =
  'Low sample — the confidence interval is wide, so treat this rate with caution.'

function titleFor(
  games: number | undefined,
  message: string | undefined
): string {
  if (message) return message
  if (games !== undefined) {
    return `Low sample (${games} game${games === 1 ? '' : 's'}) — wide confidence interval.`
  }
  return DEFAULT_MESSAGE
}

/**
 * Flags low-confidence figures (few games → wide CI). Renders either a compact
 * inline warning glyph (used inside table cells, next to a win rate) or a full
 * callout block above a table / chart.
 */
export function LowSampleNotice({
  inline = false,
  games,
  message,
  className,
}: LowSampleNoticeProps) {
  if (inline) {
    const title = titleFor(games, message)
    return (
      <span
        title={title}
        className={cn(
          'inline-flex items-center text-amber-600 dark:text-amber-400',
          className
        )}
      >
        <TriangleAlert className="size-3.5" aria-hidden />
        <span className="sr-only">{title}</span>
      </span>
    )
  }

  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300',
        className
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message ?? DEFAULT_MESSAGE}</span>
    </div>
  )
}
