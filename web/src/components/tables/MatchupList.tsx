import type { MatchupCellDTO } from '@/datasource/types'
import { LowSampleNotice } from '@/components/LowSampleNotice'
import { ciText, inkFill, pctI, rec } from '@/lib/ink'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// MatchupList — the single per-archetype matchup list (KTD2). Extracted from
// the archetype page's local component so the matrix surfaces can feed it the
// same `MatchupCellDTO[]` shape (`ArchetypeDetailDTO.matchups`).
// A server component: ink bar + record math come from `lib/ink` (§9 rule 5),
// and the 95% CI renders inline so nothing is hover-only on touch (R5).
// ---------------------------------------------------------------------------

export type MatchupListSort = 'games' | 'wrAsc'

export type MatchupListProps = {
  cells: MatchupCellDTO[]
  /** `games` (default): match volume desc, as on the archetype page.
   *  `wrAsc`: worst matchups first, for the matrix fallback ordering. */
  sort?: MatchupListSort
  /** Optional opponent slug → presence rank, shown as a `#2` chip on the
   *  matrix surfaces where the grid's numbered heads carry the identity. */
  ranks?: Record<string, number>
}

/** Pure ordering for the list. `games`: volume desc, then wr desc. `wrAsc`:
 *  worst supported matchups first; low-sample cells (rendered `–`) sink below
 *  them and no-data pairs to the very end. Never mutates its input. */
export function sortCells(
  cells: readonly MatchupCellDTO[],
  sort: MatchupListSort
): MatchupCellDTO[] {
  if (sort === 'wrAsc') {
    // Tier: 0 = reliable estimate, 1 = low-N (renders `–`), 2 = no data.
    const tier = (c: MatchupCellDTO) => (c.games === 0 ? 2 : c.lowN ? 1 : 0)
    return [...cells].sort(
      (a, b) => tier(a) - tier(b) || a.wr - b.wr || b.games - a.games
    )
  }
  return [...cells].sort((a, b) => b.games - a.games || b.wr - a.wr)
}

/**
 * Whether the list needs the thin-sample hedge: when more than half of the
 * games behind it sit in low-N pairings, or there are none at all. Counted
 * in games, not rows — a 3,000-match archetype with a long tail of 0–4-game
 * opponents is not a thin sample, and saying so would contradict the figure
 * printed beside the notice.
 */
export function needsLowSampleHedge(cells: readonly MatchupCellDTO[]): boolean {
  const total = cells.reduce((s, c) => s + c.games, 0)
  if (total === 0) return true
  const thin = cells.filter(c => c.lowN).reduce((s, c) => s + c.games, 0)
  return thin * 2 > total
}

/** Win-rate tone: the interval, not the point estimate, decides the color —
 *  shared with the grid's tooltip semantics (§9 rule 5). */
const wrTone = (c: MatchupCellDTO): string =>
  c.ciLow > 0.5 ? 'text-good' : c.ciHigh < 0.5 ? 'text-bad' : 'text-ink'

const thClass =
  'border-b border-line-strong px-3.5 py-2.5 text-[11px] font-semibold tracking-[0.13em] text-ink-3 uppercase'
const tdClass = 'border-b border-line px-3.5 py-2'

function MatchupRow({
  cell: c,
  rank,
}: {
  cell: MatchupCellDTO
  rank?: number | string
}) {
  return (
    <tr className="hover:bg-[var(--gold-wash)]">
      <td className={cn(tdClass, 'min-w-[9rem] text-ink')}>
        {rank !== undefined && (
          <span className="num mr-2 text-[11px] text-ink-3">#{rank}</span>
        )}
        {c.colName}
      </td>
      <td className={cn(tdClass, 'text-right whitespace-nowrap')}>
        {c.lowN ? (
          <span className="data text-ink-3">–</span>
        ) : (
          <span className={`data font-bold ${wrTone(c)}`}>{pctI(c.wr)}</span>
        )}
        {/* Inline 95% CI (R5) — the grid tooltip's interval, readable
            without hover. */}
        {c.games > 0 && (
          <span className="num block text-[11px] text-ink-2">
            {ciText(c.ciLow, c.ciHigh)}
          </span>
        )}
        {/* Confidence-as-ink bar (§9 rule 5) from the shared helper. */}
        {!c.lowN && c.games > 0 && (
          <span
            aria-hidden
            className="mt-1 ml-auto block h-[3px] w-16 overflow-hidden"
            style={{ background: 'var(--raised)' }}
          >
            <span
              className="block h-full"
              style={{
                width: pctI(c.wr),
                background: inkFill(c.wr, c.reliability),
              }}
            />
          </span>
        )}
      </td>
      <td className={cn(tdClass, 'text-right whitespace-nowrap')}>
        <span className="data">
          {rec(c.wins, c.losses)}
          {c.draws ? `–${c.draws}` : ''}
        </span>
      </td>
      <td className={cn(tdClass, 'text-right')}>
        <span className="data">{c.games}</span>
      </td>
    </tr>
  )
}

export function MatchupList({
  cells: raw,
  sort = 'games',
  ranks,
}: MatchupListProps) {
  const cells = sortCells(raw, sort)

  if (cells.length === 0) {
    return (
      <p className="py-8 text-center text-[13.5px] text-ink-3">
        No recorded matchups for this archetype in the window.
      </p>
    )
  }

  // One-line hedge when most of the games sit in `–` cells (§9: under-sampled
  // claims are hedged, not hidden).
  const showLowSample = needsLowSampleHedge(cells)
  const totalGames = cells.reduce((s, c) => s + c.games, 0)

  return (
    <div>
      {showLowSample && (
        <LowSampleNotice
          matches={totalGames}
          unit="matches across these matchups"
          className="mb-2.5"
        />
      )}
      <div className="overflow-x-auto border border-line bg-surface shadow-ledger">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className={cn(thClass, 'text-left')}>Opponent</th>
              <th className={cn(thClass, 'text-right')}>Win rate</th>
              <th className={cn(thClass, 'text-right')}>Record</th>
              <th className={cn(thClass, 'text-right')}>Matches</th>
            </tr>
          </thead>
          <tbody>
            {cells.map(c => (
              <MatchupRow
                key={`${c.rowSlug}-${c.colSlug}`}
                cell={c}
                rank={ranks ? (ranks[String(c.colSlug)] ?? '—') : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default MatchupList
