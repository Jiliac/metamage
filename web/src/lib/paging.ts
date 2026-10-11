// ---------------------------------------------------------------------------
// Pure paging helpers for long server-rendered lists (the event standings).
// No React, no URL knowledge: callers hand in the rows and the parsed page
// number and get the slice plus the figures the Pager renders.
// ---------------------------------------------------------------------------

export type PageSlice<T> = {
  /** The rows of the clamped page. */
  visible: T[]
  /** The clamped 1-based page actually shown. */
  page: number
  /** Total page count (at least 1). */
  pages: number
  total: number
  /** 1-based inclusive bounds of `visible` within the list; 0–0 when empty. */
  from: number
  to: number
}

/** Slice page `page` (1-based) of `items`, `size` rows per page. Out-of-range
 *  pages clamp to the nearest edge rather than rendering an empty table. */
export function slicePage<T>(
  items: readonly T[],
  page: number,
  size: number
): PageSlice<T> {
  const per = Math.max(1, Math.floor(size))
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / per))
  const p = Math.min(pages, Math.max(1, Math.floor(page) || 1))
  const start = (p - 1) * per
  const visible = items.slice(start, start + per)
  return {
    visible,
    page: p,
    pages,
    total,
    from: visible.length ? start + 1 : 0,
    to: start + visible.length,
  }
}

export type PageToken = number | 'gap'

/**
 * The page numbers a pager shows: the first and last page, `radius` pages
 * either side of the current one, and a `gap` for each run that is skipped.
 * A run of exactly one page is shown as the number itself — a gap that hides
 * one page would be longer than the page it hides.
 */
export function pageWindow(
  page: number,
  pages: number,
  radius = 1
): PageToken[] {
  const n = Math.max(1, pages)
  const p = Math.min(n, Math.max(1, page))
  const keep = new Set<number>([1, n])
  for (let i = p - radius; i <= p + radius; i++) {
    if (i >= 1 && i <= n) keep.add(i)
  }
  const sorted = [...keep].sort((a, b) => a - b)
  const out: PageToken[] = []
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    const prev = sorted[i - 1]
    if (prev !== undefined && cur - prev === 2) out.push(prev + 1)
    else if (prev !== undefined && cur - prev > 2) out.push('gap')
    out.push(cur)
  }
  return out
}
