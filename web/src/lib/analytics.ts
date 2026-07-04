'use client'

import posthog from 'posthog-js'

// ---------------------------------------------------------------------------
// Typed analytics wrapper. `reparameterize` is the key product funnel (blueprint
// §6, risk #10): it fires from the single `setParams()` choke point in
// `useMetaParams`, never bolted on per-control. Every call is a no-op unless
// `NEXT_PUBLIC_POSTHOG_KEY` is set (so local dev / OSS forks stay silent), and
// captures are guarded against SSR where there is no PostHog client.
// ---------------------------------------------------------------------------

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY

/** True when a PostHog key is configured — analytics is otherwise a no-op. */
export function isAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY)
}

// The single lens-change funnel. `changedKeys` names the knobs that moved so the
// funnel can segment which controls users actually reach for.
export type ReparameterizeProps = {
  format: string
  changedKeys: string[]
  start: string
  end: string
  topN: number
  minMatches: number
  weight: 'match' | 'entry'
  hideBuckets: boolean
  addCount: number
  sort: string
  matrixTopN: number
}

// Extend this map as new typed events are introduced; `capture` stays type-safe.
type AnalyticsEvents = {
  reparameterize: ReparameterizeProps
}

/** Fire a typed analytics event. No-ops without a key or on the server. */
export function capture<E extends keyof AnalyticsEvents>(
  event: E,
  properties: AnalyticsEvents[E]
): void {
  if (!POSTHOG_KEY) return
  if (typeof window === 'undefined') return
  posthog.capture(event, properties)
}
