import { DEFAULTS } from '@/lib/params'

// ---------------------------------------------------------------------------
// MatrixSkeleton — the streaming fallback for the meta-page matrix hero (R6).
// It mirrors the SAME variant seam as the resolved content (KTD3): a list-shaped
// skeleton `matrix:hidden` and a grid-shaped skeleton `hidden matrix:block`,
// each sized to the default `?n` rows, so whichever variant resolves lands in
// the space already reserved and the Suspense resolve shifts nothing. The list
// variant's stub row doubles as the static fallback for the row selector.
// Server-renderable; purely decorative (`aria-hidden`).
// ---------------------------------------------------------------------------

export type MatrixSkeletonProps = {
  /** Row count to reserve; defaults to the canonical `?n` default. */
  n?: number
}

export function MatrixSkeleton({
  n = DEFAULTS.matrixTopN,
}: MatrixSkeletonProps) {
  return (
    <div aria-hidden>
      {/* list variant — matches MatchupList + MatrixRowPicker proportions */}
      <div className="matrix:hidden">
        <div className="mb-3 h-8 w-[260px] rounded-md border border-line bg-raised" />
        <div className="border border-line bg-surface shadow-ledger">
          <div className="h-[42px] border-b border-line-strong" />
          {Array.from({ length: n }, (_, i) => (
            <div
              key={`l-${i}`}
              className="h-[44px] border-b border-line"
              style={{ background: i % 2 ? 'var(--surface)' : 'var(--raised)' }}
            />
          ))}
        </div>
      </div>
      {/* grid variant — matches MatchupMatrix proportions */}
      <div className="hidden matrix:block">
        <div
          className="grid gap-[2px]"
          style={{
            gridTemplateColumns: `minmax(200px, 1.3fr) repeat(${n}, minmax(54px, 1fr))`,
            minWidth: 200 + n * 56,
          }}
        >
          <div className="h-[31px]" />
          {Array.from({ length: n }, (_, i) => (
            <div key={`gh-${i}`} className="h-[31px]" />
          ))}
          {Array.from({ length: n * (n + 1) }, (_, i) => (
            <div key={`gc-${i}`} className="min-h-[48px] bg-raised" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default MatrixSkeleton
