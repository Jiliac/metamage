'use client'

import * as React from 'react'
import Link from 'next/link'

import { ArtCrop } from '@/components/ArtCrop'
import { ciText, inkFill, pctI, rec } from '@/lib/ink'
import { cn } from '@/lib/utils'
import type {
  ArchetypeSlug,
  MatchupCellDTO,
  MatrixDTO,
  MatrixOrderEntryDTO,
} from '@/datasource/types'

// ---------------------------------------------------------------------------
// CompactMatrix — the N×N grid for phones and touch screens (the `matrix:`
// seam's narrow side, KTD3). The whole field reads at a glance like the
// desktop grid, just denser: each row and column head is the archetype's
// signature-card art (the same identity as the DeckTiles, §9 rule 3), and each
// cell one integer win rate on the same confidence-as-ink fill (§9 rule 5,
// `lib/ink`). Nothing is hover-only (R5): tapping a cell fills the readout
// under the grid with the names, record and 95% interval. An art legend names
// each archetype and links it. Cells keep a 24px minimum target (WCAG 2.2
// 2.5.8); past ~12 columns on a phone the grid scrolls with the row heads
// pinned.
// ---------------------------------------------------------------------------

export type CompactMatrixProps = {
  data: MatrixDTO
  /** slug → archetype-detail href (a plain record: crosses the RSC boundary). */
  rowHref?: Record<string, string>
}

/** The tapped cell, held by archetype rather than position: a lens change
 *  swaps `order` under the mounted grid (client navigation keeps state). */
export type Sel = { row: ArchetypeSlug; col: ArchetypeSlug }

export type ResolvedPick = {
  r: number
  c: number
  row: MatrixOrderEntryDTO
  col: MatrixOrderEntryDTO
}

/** Where the pick sits in the current order; null when nothing is picked or
 *  either archetype has left the grid. Pure. */
export function resolvePick(
  order: readonly MatrixOrderEntryDTO[],
  sel: Sel | null
): ResolvedPick | null {
  if (!sel) return null
  const r = order.findIndex(o => o.slug === sel.row)
  const c = order.findIndex(o => o.slug === sel.col)
  if (r < 0 || c < 0) return null
  return { r, c, row: order[r], col: order[c] }
}

/** Head art: fills its grid slot like a small card; a gold ring marks the
 *  row/column of the tapped cell. The name rides in sr-only text beside it. */
function ArtHead({
  entry,
  active,
  className,
}: {
  entry: MatrixOrderEntryDTO
  active: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative block overflow-hidden rounded-[4px] border border-line-strong',
        active && 'border-gold shadow-[0_0_0_1.5px_var(--gold)]',
        className
      )}
    >
      <ArtCrop
        url={entry.art?.artCropUrl ?? null}
        colors={entry.color}
        radius={3}
        sizes="48px"
      />
    </span>
  )
}

function recordText(cell: MatchupCellDTO): string {
  return `${rec(cell.wins, cell.losses)}${cell.draws > 0 ? `–${cell.draws}` : ''}`
}

export function CompactMatrix({ data, rowHref }: CompactMatrixProps) {
  const { order, cells } = data
  const [sel, setSel] = React.useState<Sel | null>(null)

  const cellBy = React.useMemo(() => {
    const m = new Map<string, MatchupCellDTO>()
    for (const c of cells) m.set(`${c.rowSlug}|${c.colSlug}`, c)
    return m
  }, [cells])

  const n = order.length
  const gridTemplateColumns = `30px repeat(${n}, minmax(24px, 1fr))`

  const pick = resolvePick(order, sel)
  const picked = pick
    ? cellBy.get(`${pick.row.slug}|${pick.col.slug}`)
    : undefined
  const pickedRow = pick?.row
  const pickedCol = pick?.col

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-px"
          style={{ gridTemplateColumns, minWidth: 30 + n * 25 }}
        >
          {/* corner */}
          <div className="sticky left-0 z-10 bg-surface" />
          {order.map((col, c) => (
            <div key={`h-${col.slug}`} className="pb-1" title={col.name}>
              <ArtHead
                entry={col}
                active={pick?.c === c}
                className="h-[34px] w-full sm:h-[44px]"
              />
              <span className="sr-only">{col.name}</span>
            </div>
          ))}

          {order.map((rowEntry, r) => (
            <React.Fragment key={`r-${rowEntry.slug}`}>
              <div
                className="sticky left-0 z-10 bg-surface pr-[3px]"
                title={rowEntry.name}
              >
                <ArtHead
                  entry={rowEntry}
                  active={pick?.r === r}
                  className="h-full w-full"
                />
                <span className="sr-only">{rowEntry.name}</span>
              </div>
              {order.map((col, c) => {
                const cell = cellBy.get(`${rowEntry.slug}|${col.slug}`)
                const isMirror = cell?.isMirror ?? rowEntry.slug === col.slug
                if (isMirror) {
                  return (
                    <div
                      key={`c-${rowEntry.slug}-${col.slug}`}
                      aria-hidden
                      className="h-[30px] border border-dashed border-line sm:h-[40px]"
                    />
                  )
                }
                const low = cell?.lowN ?? true
                const selected = pick?.r === r && pick?.c === c
                const crossed =
                  !selected && pick != null && (pick.r === r || pick.c === c)
                return (
                  <button
                    key={`c-${rowEntry.slug}-${col.slug}`}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${rowEntry.name} vs ${col.name}: ${
                      low ? 'too few games' : pctI(cell?.wr ?? 0)
                    }`}
                    onClick={() =>
                      setSel(
                        selected ? null : { row: rowEntry.slug, col: col.slug }
                      )
                    }
                    className={cn(
                      'data relative grid h-[30px] cursor-pointer place-content-center text-[10.5px] font-bold tabular-nums sm:h-[40px] sm:text-[12.5px]',
                      'outline-none focus-visible:z-[3] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--gold)]',
                      low ? 'font-normal text-ink-3' : 'text-ink',
                      selected && 'z-[2] shadow-[0_0_0_2px_var(--gold)]',
                      crossed && 'shadow-[inset_0_0_0_1px_var(--gold-soft)]'
                    )}
                    style={{
                      background:
                        low || !cell
                          ? 'var(--raised)'
                          : inkFill(cell.wr, cell.reliability),
                    }}
                  >
                    {low || !cell ? '–' : Math.round(cell.wr * 100)}
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Readout — what the desktop tooltip says, for touch. Three reserved
          lines so a tap never shifts the legend below. */}
      <div
        aria-live="polite"
        className="mt-3 min-h-[60px] border-l-2 border-gold-soft pl-3 text-[13px] leading-snug text-ink-2 tabular-nums"
      >
        {picked && pickedRow && pickedCol ? (
          <>
            <div>
              <b className="text-ink">{pickedRow.name}</b> vs{' '}
              <b className="text-ink">{pickedCol.name}</b>
            </div>
            <div>
              {picked.games === 0 ? (
                'No recorded games'
              ) : picked.lowN ? (
                <>{recordText(picked)} · too few games for a rate</>
              ) : (
                <>
                  <b className="text-ink">{pctI(picked.wr)}</b> ·{' '}
                  {recordText(picked)} · 95% CI{' '}
                  {ciText(picked.ciLow, picked.ciHigh)}
                  {picked.ciCrosses50 ? ' · could go either way' : ''}
                </>
              )}
            </div>
          </>
        ) : (
          <p>
            Row beats column, in percent. Tap a cell for its record and 95%
            interval.
          </p>
        )}
      </div>

      {/* Art legend — which card is which archetype, linking each detail page. */}
      <ol className="mt-3 grid list-none grid-cols-2 gap-x-4 border-t border-line p-0 pt-2 text-[12.5px] sm:grid-cols-3">
        {order.map(o => {
          const href = rowHref?.[o.slug]
          return (
            <li key={o.slug} className="flex min-w-0 items-center gap-2">
              <ArtHead
                entry={o}
                active={false}
                className="aspect-[626/457] h-[22px] flex-none"
              />
              {href ? (
                <Link
                  href={href}
                  className="inline-flex min-h-[32px] min-w-0 items-center truncate text-ink-2 no-underline hover:text-gold hover:underline"
                  style={{ textUnderlineOffset: 3 }}
                >
                  <span className="truncate">{o.name}</span>
                </Link>
              ) : (
                <span className="truncate py-1.5 text-ink-2">{o.name}</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default CompactMatrix
