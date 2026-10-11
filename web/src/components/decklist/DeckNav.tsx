'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { cn } from '@/lib/utils'

import { DECK_HEADER_ID } from './ids'

// ---------------------------------------------------------------------------
// DeckNav — the client side of the Decklists tab (R16/R17). Deck picks and
// "Back to featured" navigate inside a React transition, so while a swap is
// pending the current deck stays visible (dimmed) and the format-level
// loading spinner never replaces the page. On mobile a pick additionally
// scrolls to the deck header once the swap commits; the "Other decks"
// control collapses and is keyed on the shown deck id by the page, so a pick
// closes it (R16/R17).
// ---------------------------------------------------------------------------

type DeckNavValue = {
  isPending: boolean
  /**
   * Soft-navigate to a decklists-tab href. `scrollToHeader` scrolls to the
   * deck header after the swap commits (the mobile pick flow, R17).
   */
  navigate: (href: string, scrollToHeader?: boolean) => void
}

const DeckNavContext = React.createContext<DeckNavValue | null>(null)

export function DeckNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const scrollToHeaderRef = React.useRef(false)

  const navigate = React.useCallback(
    (href: string, scrollToHeader = false) => {
      scrollToHeaderRef.current = scrollToHeader
      // The transition keeps the current page rendered — and keeps the
      // format-level loading boundary from replacing it — until the swapped
      // deck commits (R17).
      startTransition(() => router.push(href, { scroll: false }))
    },
    [router]
  )

  React.useEffect(() => {
    if (isPending || !scrollToHeaderRef.current) return
    scrollToHeaderRef.current = false
    document
      .getElementById(DECK_HEADER_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [isPending])

  const value = React.useMemo(
    () => ({ isPending, navigate }),
    [isPending, navigate]
  )

  return (
    <DeckNavContext.Provider value={value}>{children}</DeckNavContext.Provider>
  )
}

export function useDeckNav(): DeckNavValue {
  const ctx = React.useContext(DeckNavContext)
  if (!ctx) throw new Error('useDeckNav must be used within DeckNavProvider')
  return ctx
}

/**
 * A decklists-tab link (a recent-deck pick or "Back to featured"). Soft-
 * navigates in a transition; `scroll={false}` keeps the page in place on
 * desktop, and on mobile the pick scrolls to the deck header (R16/R17).
 */
export function DeckLink({
  href,
  className,
  children,
  'aria-current': ariaCurrent,
}: {
  href: string
  className?: string
  children: React.ReactNode
  /** Marks the shown deck's row (RecentDecks). */
  'aria-current'?: 'true'
}) {
  const { navigate } = useDeckNav()
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      aria-current={ariaCurrent}
      onClick={e => {
        // Let modified clicks and middle clicks do their browser thing.
        if (
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return
        }
        e.preventDefault()
        const mobile =
          typeof window !== 'undefined' &&
          window.matchMedia('(max-width: 767px)').matches
        navigate(href, mobile)
      }}
    >
      {children}
    </Link>
  )
}

/** Dims the current deck panel while a swap is pending (R17). */
export function DeckDim({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { isPending } = useDeckNav()
  return (
    <div
      className={cn(
        'transition-opacity duration-150',
        isPending && 'pointer-events-none opacity-50',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * The mobile "Other decks (N)" control (R16). The list stays mounted so the
 * desktop column shows it directly; on mobile it is hidden until expanded.
 * The page keys this component on the shown deck id, so a pick remounts it
 * closed (R17).
 */
export function OtherDecksControl({
  count,
  children,
  className,
}: {
  count: number
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold md:hidden flex w-full items-center justify-between border border-line bg-surface px-4 py-3 text-[13px] font-semibold text-ink shadow-ledger hover:text-gold"
      >
        Other decks ({count})
        <span aria-hidden className="text-ink-3">
          {open ? '−' : '+'}
        </span>
      </button>
      <div className={cn('pt-3 md:block', open ? 'block' : 'max-md:hidden')}>
        {children}
      </div>
    </div>
  )
}

export default DeckNavProvider
