'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

// ---------------------------------------------------------------------------
// Client provider tree (blueprint §6): next-themes (class strategy over the
// oklch tokens → real light/dark) wrapping the PostHog provider. PostHog only
// initializes when NEXT_PUBLIC_POSTHOG_KEY is present; otherwise children render
// untouched and `capture()` (analytics.ts) stays a no-op.
// ---------------------------------------------------------------------------

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return
    if (posthog.__loaded) return
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      capture_pageleave: true,
      defaults: '2025-05-24',
    })
  }, [])

  if (!POSTHOG_KEY) return <>{children}</>
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <AnalyticsProvider>{children}</AnalyticsProvider>
    </ThemeProvider>
  )
}
