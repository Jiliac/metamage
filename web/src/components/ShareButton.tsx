'use client'

import { Link2 } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { knobClass, shareClass } from '@/components/LensBar/styles'

// ---------------------------------------------------------------------------
// ShareButton — the gold "Share this view" control at the right of the LensBar
// (§9). The whole product is URL-as-state, so sharing is literally copying the
// current canonical URL. Confirms with a sonner toast (Ledger-styled).
// `compact` renders the link glyph alone (the label becomes the accessible
// name) for the phone LensBar, where the lens summary needs the width.
// ---------------------------------------------------------------------------

export type ShareButtonProps = {
  className?: string
  label?: string
  compact?: boolean
}

export function ShareButton({
  className,
  label = 'Share this view',
  compact = false,
}: ShareButtonProps) {
  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Link copied', {
        description: 'Every view is a URL — paste to share this exact lens.',
      })
    } catch {
      toast.error('Could not copy the link')
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cn(knobClass, shareClass, compact && 'px-3', className)}
    >
      {compact ? <Link2 aria-hidden className="size-4" /> : label}
    </button>
  )
}

export default ShareButton
