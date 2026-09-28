// ---------------------------------------------------------------------------
// Sticky pinned ledger columns, shared by every table that scrolls
// horizontally on narrow screens. The first column pins at the left edge; a
// second one pins just past it. The first column's width is baked into
// STICKY_COL_1 itself: `w-[58px]` under border-box renders the column at
// exactly 58px (30px content + 2 × 14px `px-3.5` padding), so STICKY_COL_2's
// `left-[58px]` matches the rendered width by construction and no table can
// drift by re-declaring its own width token.
//
// Class strings are literal so Tailwind's scanner sees every token.
// ---------------------------------------------------------------------------

const STICKY_BASE =
  'sticky z-20 bg-surface group-hover:bg-gold-wash after:absolute after:inset-y-0 after:right-0 after:w-px'

/** First pinned column (the rank / index / date cell) — fixed 58px rendered
 *  width; do not add another width utility at the call site. */
export const STICKY_COL_1 = `${STICKY_BASE} left-0 w-[58px] after:bg-line`

/** Second pinned column, offset past the 58px first column. */
export const STICKY_COL_2 = `${STICKY_BASE} left-[58px] after:bg-line`

/** Strong-hairline variants for the MetaTable ledger. */
export const STICKY_COL_1_STRONG = `${STICKY_BASE} left-0 after:bg-line-strong`
export const STICKY_COL_2_STRONG = `${STICKY_BASE} left-[58px] after:bg-line-strong`
