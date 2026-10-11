import * as React from 'react'

// ---------------------------------------------------------------------------
// LedgerRow — one line of the headline ledger under a page's H1 (§9 Headline
// Pattern): a small tracked label, then the figures with their interval.
// Render inside a <dl> laid out as `grid-cols-[max-content_1fr]`; dt/dd are
// direct grid children, so every label shares one max-content column and
// none of them wrap. Server-renderable.
// ---------------------------------------------------------------------------

export function LedgerRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="text-ink-3 text-[11px] leading-[1.9] tracking-[0.12em] whitespace-nowrap uppercase max-[460px]:mt-1.5">
        {label}
      </dt>
      <dd className="leading-[1.55]">{children}</dd>
    </>
  )
}

/** The <dl> the rows sit in: label column + figures, stacked below 460px. */
export const LEDGER_DL_CLASS =
  'text-ink-2 mt-4 grid max-w-[64ch] grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13.5px] max-[460px]:grid-cols-1 max-[460px]:gap-y-0.5'

export default LedgerRow
