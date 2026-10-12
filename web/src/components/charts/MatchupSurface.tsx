import type { MatrixDTO } from '@/datasource/types'
import { CompactMatrix } from '@/components/charts/CompactMatrix'
import { MatchupMatrix } from '@/components/charts/MatchupMatrix'

// ---------------------------------------------------------------------------
// MatchupSurface — the shared matrix seam (§9 Matrix Seam Rule). The full
// N×N grid with names, records and hover tooltips on a wide, hover-capable
// screen (`hidden matrix:block`, KTD3); the compact numbered grid with a tap
// readout everywhere else (`matrix:hidden`), so phones still see every
// matchup at once. Both variants are server-rendered in one pass; the seam is
// CSS-only, so no hydration mismatch or layout swap. Call sites own the
// empty/2-row guards and any surrounding chrome.
// ---------------------------------------------------------------------------

export type MatchupSurfaceProps = {
  matrix: MatrixDTO
  /** Builds the row-header href for an archetype slug. */
  hrefFor: (slug: string) => string
}

export function MatchupSurface({ matrix, hrefFor }: MatchupSurfaceProps) {
  const rowHref = Object.fromEntries(
    matrix.order.map(o => [o.slug, hrefFor(o.slug)])
  )
  return (
    <>
      {/* full grid — desktop seam (KTD3) */}
      <div className="hidden matrix:block">
        <MatchupMatrix data={matrix} rowHref={rowHref} />
      </div>
      {/* compact grid — phones, tablets, touch */}
      <div className="matrix:hidden">
        <CompactMatrix data={matrix} rowHref={rowHref} />
      </div>
    </>
  )
}

export default MatchupSurface
