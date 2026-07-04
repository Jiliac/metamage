import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type BucketBadgeProps = {
  /** Override the chip text (defaults to a generic `bucket` marker). */
  label?: string
  className?: string
}

/**
 * Marks an `isBucket` archetype row (the `unknown` / `conflict` catch-alls) so it
 * reads as a bucket rather than a real archetype. Visually de-emphasized per the
 * blueprint (buckets are hidden by default and never counted in tier math).
 */
export function BucketBadge({ label = 'bucket', className }: BucketBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-dashed text-[10px] font-normal tracking-wide text-muted-foreground uppercase',
        className
      )}
    >
      {label}
    </Badge>
  )
}
