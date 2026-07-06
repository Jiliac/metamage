'use client'

import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { knobClass, shareClass } from '@/components/LensBar/styles'

// ---------------------------------------------------------------------------
// ShareButton — the gold "Share this view" control at the right of the LensBar
// (§9). The whole product is URL-as-state, so sharing is literally copying the
// current canonical URL. Confirms with a sonner toast (Ledger-styled).
// ---------------------------------------------------------------------------

export type ShareButtonProps = {
  className?: string
  label?: string
}

export function ShareButton({
  className,
  label = 'Share this view',
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
      className={cn(knobClass, shareClass, className)}
    >
      {label}
    </button>
  )
}

export default ShareButton
