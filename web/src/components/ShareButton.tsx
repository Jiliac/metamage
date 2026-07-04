'use client'

import { Check, Link2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Copies the current fully-parameterized URL. Because the URL is the single
// source of truth (blueprint §6), the copied link round-trips the exact lens:
// canonical == shareable == OG == cache key. Adapted from legacy ui/ShareButton.
export function ShareButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={cn('gap-1.5', className)}
    >
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      Share
    </Button>
  )
}
