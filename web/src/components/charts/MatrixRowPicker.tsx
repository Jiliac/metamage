'use client'

import * as React from 'react'

import type { MatrixOrderEntryDTO } from '@/datasource/types'
import { cn } from '@/lib/utils'
import { useMetaParams } from '@/hooks/useMetaParams'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------------------------------------------------------------------------
// MatrixRowPicker — the `?row=` archetype selector for the mobile matchup list
// (KTD4, R8). A client component only because the Radix Select needs state and
// the write path is `useMetaParams.setParams`; the list itself is passed in as
// server-rendered `children` so both matrix variants ship in the SSR payload.
// While the RSC round-trip runs, the rows dim (`aria-busy` + opacity) so a
// selector change is never a silent no-op on a slow connection (U2 step 6).
// ---------------------------------------------------------------------------

export type MatrixRowPickerProps = {
  order: MatrixOrderEntryDTO[]
  /** Server-rendered MatchupList for the selected row. */
  children: React.ReactNode
}

export function MatrixRowPicker({ order, children }: MatrixRowPickerProps) {
  const { row, isPending, setParams } = useMetaParams(order)
  const selected = row ?? order[0]?.slug

  // Matrix order shorter than 2 rows: the list alone needs no selector.
  if (order.length < 2) return <>{children}</>

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <label
          className="text-[11px] font-semibold tracking-[0.13em] text-ink-3 uppercase"
          id="matrix-row-label"
        >
          Archetype
        </label>
        <Select
          value={selected}
          onValueChange={v =>
            setParams({ row: v as MatrixOrderEntryDTO['slug'] })
          }
        >
          <SelectTrigger
            aria-labelledby="matrix-row-label"
            className="w-[260px] max-w-full"
          >
            {/* Children, not resolved-item text: Radix resolves SelectValue
                client-side only, and the trigger must show the archetype in
                the SSR markup too. */}
            <SelectValue>
              {order.find(o => o.slug === selected)?.name ?? 'Archetype'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {order.map(o => (
              <SelectItem key={o.slug} value={String(o.slug)}>
                <span className="num mr-2 text-[11px] text-ink-3">
                  #{o.presenceRank}
                </span>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        aria-busy={isPending || undefined}
        className={cn(
          'transition-opacity duration-200',
          isPending && 'opacity-60'
        )}
      >
        {children}
      </div>
    </>
  )
}

export default MatrixRowPicker
