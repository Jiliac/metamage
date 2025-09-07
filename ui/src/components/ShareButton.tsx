'use client'

import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ShareButtonProps {
  toolCallId: string
}

export function ShareButton({ toolCallId }: ShareButtonProps) {
  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      const url = `${window.location.origin}/tool/${toolCallId}`
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard!')
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  return (
    <div className="flex justify-end mt-3">
      <Button
        variant="ghost"
        size="sm"
        className="text-slate-400 text-xs"
        onClick={handleCopyLink}
      >
        Share
        <svg
          className="ml-1 h-3 w-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
          />
        </svg>
      </Button>
    </div>
  )
}
