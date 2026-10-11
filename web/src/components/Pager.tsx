import * as React from 'react'
import Link from 'next/link'

import { pageWindow } from '@/lib/paging'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Pager — the ledger's page strip for long server-rendered lists (the event
// standings). Plain links, so every page is a URL (`?page=n`): no client
// state, nothing to hydrate. Knob styling from the LensBar (sharp hairline
// chrome, gold-filled current page), 44px targets below `md`. The range line
// ("Players 51–100 of 1,491") is the strip's own label; `aria-current` marks
// the page in view.
// ---------------------------------------------------------------------------

export type PagerProps = {
  /** The clamped current page (1-based). */
  page: number
  pages: number
  /** 1-based inclusive bounds of the rows on this page, and the list size. */
  from: number
  to: number
  total: number
  /** Plural noun for the rows, e.g. 'players'. */
  unit: string
  /** The href of page `n`, built by the caller with the lens preserved. */
  hrefFor: (n: number) => string
  className?: string
}

const knob =
  'inline-flex items-center justify-center border border-line px-2.5 py-[5px] text-[13px] text-ink-2 no-underline transition-colors ' +
  'max-md:min-h-[44px] max-md:min-w-[44px] ' +
  'hover:border-line-strong hover:text-ink ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold'

const knobCurrent = 'border-gold bg-gold font-semibold text-bg hover:text-bg'

const knobDisabled =
  'cursor-not-allowed border-line text-ink-3 opacity-50 hover:border-line hover:text-ink-3'

const int = (n: number) => n.toLocaleString('en-US')

export function Pager({
  page,
  pages,
  from,
  to,
  total,
  unit,
  hrefFor,
  className,
}: PagerProps) {
  if (pages <= 1) return null
  const tokens = pageWindow(page, pages)
  return (
    <nav
      aria-label={`${unit} pages`}
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3',
        className
      )}
    >
      <p className="text-ink-3 text-[12.5px] capitalize">
        {unit}{' '}
        <span className="num text-ink-2">
          {int(from)}–{int(to)}
        </span>{' '}
        <span className="normal-case">of</span>{' '}
        <span className="num text-ink-2">{int(total)}</span>
      </p>
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          <Edge href={page > 1 ? hrefFor(page - 1) : null} label="Previous">
            ← Prev
          </Edge>
        </li>
        {tokens.map((t, i) =>
          t === 'gap' ? (
            <li
              key={`gap-${i}`}
              aria-hidden
              className="text-ink-3 px-1 text-[13px]"
            >
              …
            </li>
          ) : (
            <li key={t}>
              <Link
                href={hrefFor(t)}
                aria-current={t === page ? 'page' : undefined}
                aria-label={`Page ${t}`}
                className={cn(
                  knob,
                  'num min-w-[34px]',
                  t === page && knobCurrent
                )}
              >
                {t}
              </Link>
            </li>
          )
        )}
        <li>
          <Edge href={page < pages ? hrefFor(page + 1) : null} label="Next">
            Next →
          </Edge>
        </li>
      </ul>
    </nav>
  )
}

/** Prev/Next: a link when there is somewhere to go, else a disabled knob
 *  that stays in the strip so the layout never jumps between pages. */
function Edge({
  href,
  label,
  children,
}: {
  href: string | null
  label: string
  children: React.ReactNode
}) {
  if (!href) {
    return (
      <span aria-disabled className={cn(knob, knobDisabled)}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} aria-label={`${label} page`} className={knob}>
      {children}
    </Link>
  )
}

export default Pager
