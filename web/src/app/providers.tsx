'use client'

import * as React from 'react'
import { ThemeProvider } from 'next-themes'
import posthog from 'posthog-js'

import { isAnalyticsEnabled } from '@/lib/analytics'

// ---------------------------------------------------------------------------
// App-wide client providers (blueprint §6). Two concerns:
//   1. ThemeProvider — next-themes CLASS strategy. globals.css keys dark off the
//      `.dark` class (and `[data-theme]`), so `attribute="class"` makes the theme
//      toggle drive the Arena-bronze / parchment tokens. `defaultTheme="system"`
//      tracks prefers-color-scheme until the user toggles.
//   2. PostHog — initialised once, only when a key is configured. Without a key
//      the whole analytics path (including `capture`) no-ops.
// ---------------------------------------------------------------------------

let posthogInitialised = false

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if (posthogInitialised) return
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!isAnalyticsEnabled() || !key) return
    posthogInitialised = true
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    })
  }, [])

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}

export default Providers
