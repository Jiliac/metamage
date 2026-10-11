import type { MatrixDTO } from '@/datasource/types'
import { MatchupMatrix } from '@/components/charts/MatchupMatrix'
import { MatrixRowPicker } from '@/components/charts/MatrixRowPicker'
import { MatchupList, selectRowCells } from '@/components/tables/MatchupList'

// ---------------------------------------------------------------------------
// MatchupSurface — the shared matrix/list seam (§9 Matrix Seam Rule). The N×N
// grid only on a wide, hover-capable screen (`hidden matrix:block`, KTD3);
// the per-archetype list with inline CIs everywhere else (`matrix:hidden`),
// selected by `?row=` and defaulting to presence rank 1 (R4). Both variants
// are server-rendered in one pass; the seam is CSS-only, so no hydration
// mismatch or layout swap. Call sites own the empty/2-row guards and any
// surrounding chrome; this component always renders the seam pair.
// ---------------------------------------------------------------------------

export type MatchupSurfaceProps = {
  matrix: MatrixDTO
  /** `?row`, the list's selected archetype slug (presence rank 1 when absent). */
  row: string | undefined
  /** Builds the row-header href for an archetype slug. */
  hrefFor: (slug: string) => string
}

export function MatchupSurface({ matrix, row, hrefFor }: MatchupSurfaceProps) {
  const rowHref = Object.fromEntries(
    matrix.order.map(o => [o.slug, hrefFor(o.slug)])
  )
  // An empty order has no row to select; callers guard that before reaching
  // here, but the matrix route composes this inside a non-empty check.
  const picked = matrix.order.length > 0 ? selectRowCells(matrix, row) : null
  return (
    <>
      {/* grid — desktop seam (KTD3) */}
      <div className="hidden matrix:block">
        <MatchupMatrix data={matrix} rowHref={rowHref} />
      </div>
      {/* list — everywhere else; `?row` selection, rank-1 default (R4) */}
      <div className="matrix:hidden">
        <MatrixRowPicker order={matrix.order}>
          {picked && (
            <MatchupList
              cells={picked.cells}
              sort="wrAsc"
              ranks={picked.ranks}
            />
          )}
        </MatrixRowPicker>
      </div>
    </>
  )
}

export default MatchupSurface
