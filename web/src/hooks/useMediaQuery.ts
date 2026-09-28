'use client'

import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// useMediaQuery — a subscription to `window.matchMedia(query)` via
// useSyncExternalStore. `serverValue` is what SSR and the first client render
// assume, so the common viewport hydrates without a layout shift and the other
// corrects right after hydration. The charts use `useIsDesktop` to pick their
// fixed height.
// ---------------------------------------------------------------------------

const noopUnsubscribe = () => {}

export function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    onChange => {
      if (typeof window === 'undefined') return noopUnsubscribe
      const mql = window.matchMedia(query)
      // Older Safari/WebKit (pre-14) lacks MediaQueryList.addEventListener.
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange)
        return () => mql.removeEventListener('change', onChange)
      }
      mql.addListener(onChange)
      return () => mql.removeListener(onChange)
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  )
}

/** Tailwind `md` breakpoint. SSR assumes desktop. */
export const MD_QUERY = '(min-width: 768px)'

export function useIsDesktop(): boolean {
  return useMediaQuery(MD_QUERY, true)
}
