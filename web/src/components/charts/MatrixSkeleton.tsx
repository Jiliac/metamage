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
      {/* compact variant — matches CompactMatrix proportions */}
      <div className="matrix:hidden">
        <div
          className="grid gap-px"
          style={{
            gridTemplateColumns: `30px repeat(${n}, minmax(24px, 1fr))`,
          }}
        >
          <div className="h-[38px] sm:h-[48px]" />
          {Array.from({ length: n }, (_, i) => (
            <div key={`ch-${i}`} className="h-[38px] sm:h-[48px]" />
          ))}
          {Array.from({ length: n * (n + 1) }, (_, i) =>
            i % (n + 1) === 0 ? (
              <div key={`cc-${i}`} />
            ) : (
              <div key={`cc-${i}`} className="h-[30px] bg-raised sm:h-[40px]" />
            )
          )}
        </div>
        <div className="mt-3 h-[60px]" />
        <div
          className="mt-3 border-t border-line pt-2"
          style={{ height: Math.ceil(n / 2) * 32 + 9 }}
        />
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
