'use client'

import * as React from 'react'
import Link from 'next/link'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ManaPips } from '@/components/ManaPips'
import { cn } from '@/lib/utils'
import type {
  ArchetypeSlug,
  MatchupCellDTO,
  MatrixDTO,
  MatrixOrderEntryDTO,
} from '@/datasource/types'

// ---------------------------------------------------------------------------
// MatchupMatrix — the moat (blueprint §4, §9 rule 5). A hand-built CSS grid of
// composite cells ported from the design spike:
//   • fill = confidence-as-ink via `color-mix(in oklab, pole amt%, --raised)`
//   • wr% + record text rows; '–' for low-N; blanked mirror with a dot
//   • row/col cross-highlight on hover; Radix tooltip with the 95% CI
//   • row headers: rank + ManaPips + name + global WR; numbered column heads
//   • cells link to the row archetype when `rowHref` is supplied
// A single-row variant (archetype page) is exposed via the `rows` filter prop.
// This is a client component so the hover cross-highlight works, but because
// client components are prerendered the full grid is in the SSR payload.
// ---------------------------------------------------------------------------

/** §9 rule 5 ink fill. `wr`, `reliability` are fractions (0..1). */
function inkFill(wr: number, reliability: number): string {
  const dev = Math.min(28, Math.abs(wr * 100 - 50))
  const conf = Math.max(0, Math.min(1, reliability))
  const amt = (6 + dev * 2.1) * (0.35 + 0.65 * conf)
  const pole = wr >= 0.5 ? 'var(--good)' : 'var(--bad)'
  return `color-mix(in oklab, ${pole} ${amt.toFixed(1)}%, var(--raised))`
}

const pctI = (x: number): string => `${Math.round(x * 100)}%`
const rec = (w: number, l: number): string => `${w}–${l}`

export type MatchupMatrixProps = {
  data: MatrixDTO
  /** Subset (and order) of rows to render; defaults to the full order.
   *  Pass a single slug for the archetype-page single-row variant. */
  rows?: readonly ArchetypeSlug[]
  /** Precomputed slug → detail-page href map (the row archetype a cell/row
   *  links to). A plain record rather than a function so it can cross the
   *  server → client boundary (this is a client component). */
  rowHref?: Record<string, string>
  className?: string
}

export function MatchupMatrix({
  data,
  rows,
  rowHref,
  className,
}: MatchupMatrixProps) {
  const { order, cells } = data

  // rank by slug, from the DTO's dense presenceRank → the SAME identity number
  // the table/scatter/tiles show, even on presence-weight ties (§9 rule 3).
  const rankBySlug = React.useMemo(() => {
    const m = new Map<string, number>()
    order.forEach(o => m.set(o.slug, o.presenceRank))
    return m
  }, [order])

  const cellBy = React.useMemo(() => {
    const m = new Map<string, MatchupCellDTO>()
    for (const c of cells) m.set(`${c.rowSlug}|${c.colSlug}`, c)
    return m
  }, [cells])

  const rowEntries: MatrixOrderEntryDTO[] = React.useMemo(() => {
    if (!rows) return order
    const wanted = new Set(rows)
    return order.filter(o => wanted.has(o.slug))
  }, [order, rows])

  const [hover, setHover] = React.useState<{ r: number; c: number } | null>(
    null
  )

  const gridTemplateColumns = `minmax(200px, 1.3fr) repeat(${order.length}, minmax(54px, 1fr))`

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn('overflow-x-auto', className)}>
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns, minWidth: 200 + order.length * 56 }}
          onMouseLeave={() => setHover(null)}
        >
          {/* corner */}
          <div />
          {/* numbered column heads */}
          {order.map(col => (
            <div
              key={`h-${col.slug}`}
              className="grid place-items-center py-1.5 text-[11px] text-ink-3"
            >
              <span
                className="data grid size-[19px] place-items-center rounded-full text-[10px] font-bold text-bg"
                style={{ background: 'var(--ink-3)' }}
              >
                {rankBySlug.get(col.slug)}
              </span>
            </div>
          ))}

          {/* rows */}
          {rowEntries.map((rowEntry, r) => {
            const href = rowHref?.[rowEntry.slug]
            return (
              <React.Fragment key={`r-${rowEntry.slug}`}>
                {/* row header */}
                <div className="flex items-center gap-2 whitespace-nowrap py-0 pl-0.5 pr-2.5 text-[12.5px] font-semibold">
                  <span className="data w-4 text-right text-[11px] text-ink-3">
                    {rankBySlug.get(rowEntry.slug)}
                  </span>
                  <ManaPips colors={rowEntry.color} size={14} />
                  {href ? (
                    <Link
                      href={href}
                      className="text-ink no-underline hover:text-gold hover:underline"
                      style={{ textUnderlineOffset: 3 }}
                    >
                      {rowEntry.name}
                    </Link>
                  ) : (
                    <span>{rowEntry.name}</span>
                  )}
                  <span className="data ml-auto text-[11.5px] text-ink-2">
                    {rowEntry.globalWr == null ? '—' : pctI(rowEntry.globalWr)}
                  </span>
                </div>

                {/* cells */}
                {order.map((col, c) => {
                  const cell = cellBy.get(`${rowEntry.slug}|${col.slug}`)
                  const isMirror = cell?.isMirror ?? rowEntry.slug === col.slug
                  const highlighted =
                    hover != null &&
                    ((hover.r === r && hover.c !== c) ||
                      (hover.c === c && hover.r !== r))

                  if (isMirror) {
                    return (
                      <div
                        key={`c-${rowEntry.slug}-${col.slug}`}
                        aria-label="mirror match"
                        className="grid min-h-[48px] place-content-center border border-dashed border-line bg-transparent"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ background: 'var(--line-strong)' }}
                        />
                      </div>
                    )
                  }

                  const games = cell?.games ?? 0
                  const wins = cell?.wins ?? 0
                  const losses = cell?.losses ?? 0
                  const wr = cell?.wr ?? 0
                  const low = cell?.lowN ?? games < 5

                  const hlStyle: React.CSSProperties = highlighted
                    ? {
                        transform: 'scale(1.04)',
                        boxShadow: '0 0 0 1.5px var(--gold)',
                        zIndex: 2,
                      }
                    : {}

                  const commonProps = {
                    onMouseEnter: () => setHover({ r, c }),
                    className: cn(
                      'relative grid min-h-[48px] cursor-default place-content-center text-center no-underline transition-transform',
                      'hover:z-[3] focus-visible:z-[3] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]',
                      low && 'text-ink-3'
                    ),
                    style: {
                      background: low
                        ? 'var(--raised)'
                        : inkFill(wr, cell?.reliability ?? 0),
                      ...hlStyle,
                    } as React.CSSProperties,
                  }

                  const inner = low ? (
                    <>
                      <span className="data text-[13.5px] font-normal text-ink-3">
                        –
                      </span>
                      {games > 0 && (
                        <span className="data text-[10px] text-ink-2">
                          {rec(wins, losses)}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="data text-[13.5px] font-bold">
                        {pctI(wr)}
                      </span>
                      <span className="data text-[10px] text-ink-2">
                        {rec(wins, losses)}
                      </span>
                    </>
                  )

                  const tip = (
                    <div className="leading-snug">
                      <div>
                        <b>{rowEntry.name}</b> vs <b>{col.name}</b>
                      </div>
                      <div>
                        {pctI(wr)} · {rec(wins, losses)}
                      </div>
                      <div className="opacity-75">
                        95% CI {pctI(cell?.ciLow ?? 0)}–
                        {pctI(cell?.ciHigh ?? 0)}
                        {cell?.ciCrosses50 ? ' · could go either way' : ''}
                      </div>
                    </div>
                  )

                  const el = href ? (
                    <Link
                      href={href}
                      aria-label={
                        low
                          ? `${rowEntry.name} vs ${col.name}: ${
                              games > 0
                                ? `${rec(wins, losses)}, too few games`
                                : 'no data'
                            }`
                          : `${rowEntry.name} vs ${col.name}: ${pctI(wr)}`
                      }
                      {...commonProps}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div tabIndex={0} {...commonProps}>
                      {inner}
                    </div>
                  )

                  return (
                    <Tooltip key={`c-${rowEntry.slug}-${col.slug}`}>
                      <TooltipTrigger asChild>{el}</TooltipTrigger>
                      <TooltipContent>{tip}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </TooltipProvider>
  )
}

export default MatchupMatrix
