import posthog from 'posthog-js'

// ---------------------------------------------------------------------------
// Typed analytics wrapper (blueprint §6 / risk #10). The product's key funnel is
// `reparameterize` — fired from the single `setParams()` choke point in
// `useMetaParams`, so every lens change is captured from day one.
//
// This module NO-OPS entirely when `NEXT_PUBLIC_POSTHOG_KEY` is absent (local
// dev, CI, previews) and never runs on the server. Analytics must never throw
// into the app, so `capture` swallows any error.
// ---------------------------------------------------------------------------

/** Event name → its required property shape. Add new events here to keep the
 *  `capture` call sites type-checked against the analytics contract. */
export type AnalyticsEventProps = {
  reparameterize: { format: string; changedKeys: string[] }
}

export type AnalyticsEvent = keyof AnalyticsEventProps

/** True when a PostHog key is configured; the provider only inits when true. */
export function isAnalyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
}

/**
 * Fire a typed analytics event. Silently no-ops without a configured key or on
 * the server, and never lets an analytics failure surface to the caller.
 */
export function capture<K extends AnalyticsEvent>(
  event: K,
  props: AnalyticsEventProps[K]
): void {
  if (!isAnalyticsEnabled()) return
  if (typeof window === 'undefined') return
  try {
    posthog.capture(event, props)
  } catch {
    // analytics is best-effort — never break the app
  }
}
