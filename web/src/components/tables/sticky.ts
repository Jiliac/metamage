// ---------------------------------------------------------------------------
// Sticky pinned ledger columns, shared by every table that scrolls
// horizontally on narrow screens. The first column pins at the left edge; a
// second one pins just past it. `STICKY_COL_2_LEFT` is coupled to the first
// column's `w-[30px]` plus 2 × 14px cell padding (the `px-3.5` cells), so it
// lives here once instead of in each table.
//
// Class strings are literal so Tailwind's scanner sees every token.
// ---------------------------------------------------------------------------

const STICKY_BASE =
  'sticky z-20 bg-surface group-hover:bg-gold-wash after:absolute after:inset-y-0 after:right-0 after:w-px'

/** First pinned column (the rank / index / date cell). */
export const STICKY_COL_1 = `${STICKY_BASE} left-0 after:bg-line`

/** Second pinned column, offset past a 30px first column. */
export const STICKY_COL_2 = `${STICKY_BASE} left-[58px] after:bg-line`

/** Strong-hairline variants for the MetaTable ledger. */
export const STICKY_COL_1_STRONG = `${STICKY_BASE} left-0 after:bg-line-strong`
export const STICKY_COL_2_STRONG = `${STICKY_BASE} left-[58px] after:bg-line-strong`
