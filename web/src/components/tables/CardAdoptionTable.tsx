import * as React from 'react'

import { cn } from '@/lib/utils'
import type { CardAdoptionDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// CardAdoptionTable — MAIN/SIDE adoption for an archetype's decklists (§6). The
// ledger treatment: uppercase tracked headers, title-cased card names (DB names
// are lowercase, §3), a gold presence sharebar, mono tabular figures. Server-
// renderable (no sorting needed here). One instance per board.
// ---------------------------------------------------------------------------

/** DB card names are lowercase — title-case for display (leaves // split cards). */
function titleCase(name: string): string {
  return name.replace(/(^|\s)([a-z])/g, (_m, p, c) => p + c.toUpperCase())
}

export type CardAdoptionTableProps = {
  cards: CardAdoptionDTO[]
  /** Board label shown in the caption eyebrow. */
  board?: 'MAIN' | 'SIDE'
  className?: string
}

export function CardAdoptionTable({
  cards,
  board,
  className,
}: CardAdoptionTableProps) {
  const maxPresence = Math.max(1, ...cards.map(c => c.presencePct))

  if (cards.length === 0) {
    return (
      <div
        className={cn(
          'bg-surface border-line text-ink-3 shadow-ledger border px-4 py-6 text-[13px]',
          className
        )}
      >
        No {board ? `${board.toLowerCase()}board ` : ''}cards recorded for this
        window.
      </div>
    )
  }

  return (
    <div
      className={cn('bg-surface border-line shadow-ledger border', className)}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <Th className="w-[30px]">#</Th>
              <Th>Card</Th>
              <Th align="right">Copies</Th>
              <Th align="right">Decks</Th>
              <Th>Presence</Th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c, i) => (
              <tr
                key={c.cardId}
                className="hover:bg-gold-wash [&:not(:last-child)>td]:border-line [&:not(:last-child)>td]:border-b"
              >
                <td className="text-ink-3 px-3.5 py-[7px] text-[12px]">
                  {i + 1}
                </td>
                <td className="text-ink px-3.5 py-[7px] font-semibold">
                  {titleCase(c.name)}
                </td>
                <td className="num text-ink px-3.5 py-[7px] text-right">
                  {c.avgCount.toFixed(1)}
                </td>
                <td className="num text-ink-2 px-3.5 py-[7px] text-right">
                  {c.decksPlaying.toLocaleString('en-US')}
                </td>
                <td className="px-3.5 py-[7px]">
                  <div className="flex min-w-[160px] items-center gap-2.5">
                    <div className="bg-raised relative h-3.5 flex-1">
                      <div
                        className="bg-gold-soft absolute top-0.5 bottom-0.5 left-0.5"
                        style={{
                          width: `calc(${(c.presencePct / maxPresence) * 100}% - 2px)`,
                        }}
                      >
                        <span className="bg-gold absolute top-0 right-0 bottom-0 w-[3px]" />
                      </div>
                    </div>
                    <span className="num text-ink-2 w-11 text-right text-[12px]">
                      {c.presencePct.toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      className={cn(
        'border-line-strong text-ink-3 border-b px-3.5 pt-3 pb-[9px] text-[11px] font-semibold tracking-[0.13em] whitespace-nowrap uppercase',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      {children}
    </th>
  )
}

export default CardAdoptionTable
