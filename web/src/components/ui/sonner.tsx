'use client'

import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

// Gathering Ledger toast: parchment surface, gold-hairline border, sharp chrome
// (§9 rule 4). Tokens flip with the theme; `theme` defaults to `system` so it
// tracks prefers-color-scheme until WP3's next-themes provider drives it.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface group-[.toaster]:text-ink group-[.toaster]:border group-[.toaster]:border-gold-soft group-[.toaster]:rounded-none group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-ink-2',
          actionButton: 'group-[.toast]:bg-gold group-[.toast]:text-bg',
          cancelButton: 'group-[.toast]:bg-raised group-[.toast]:text-ink-2',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
