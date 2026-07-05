import * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { ArtCrop } from '@/components/ArtCrop'
import { ManaPips } from '@/components/ManaPips'
import type { ArchetypeRowDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// DeckTile — "Top of the field" card (§9). A card-like object, so it is the one
// place that gets rounded corners (rule 4). Signature-card art with a bottom
// scrim, rank badge top-left, mana pips bottom-right over the art, then a body
// row: Optima name · meta% · CI-toned win rate. Hover lifts + goes gold.
// Server-renderable (next/link, no client hooks).
// ---------------------------------------------------------------------------

/** Win-rate tone from the clustered CI position (§9 rule 2: polarity only). */
function wrTone(wrLo: number, wrHi: number): 'up' | 'down' | 'flat' {
  if (wrLo > 0.5) return 'up'
  if (wrHi < 0.5) return 'down'
  return 'flat'
}

const TONE_CLASS: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-good',
  down: 'text-bad',
  flat: 'text-ink',
}

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`

export type DeckTileProps = {
  /** The archetype this tile represents (share/wr/art/pips all read from it). */
  row: ArchetypeRowDTO
  /** Destination — build with buildHref so the lens is preserved. */
  href: string
  /** Rank badge number; defaults to the row's presenceRank. */
  rank?: number
  /** Eager-load the art (above-the-fold top-6 grid). */
  priority?: boolean
  className?: string
}

export function DeckTile({
  row,
  href,
  rank,
  priority,
  className,
}: DeckTileProps) {
  const tone = wrTone(row.wrLo, row.wrHi)
  const rankNum = rank ?? row.presenceRank
  return (
    <Link
      href={href}
      className={cn(
        'bg-surface shadow-ledger group block overflow-hidden rounded-[12px] border',
        '[border-color:color-mix(in_oklab,var(--gold)_34%,var(--line))]',
        'transition-[transform,border-color] duration-150 ease-out',
        'hover:-translate-y-[3px] hover:[border-color:var(--gold)]',
        'focus-visible:outline-gold focus-visible:outline-2 focus-visible:outline-offset-2',
        className
      )}
    >
      <div className="bg-raised relative aspect-[2.3]">
        <ArtCrop
          url={row.art?.artCropUrl ?? null}
          colors={row.color}
          cardName={row.art?.cardName}
          radius={0}
          priority={priority}
          sizes="(max-width: 700px) 100vw, 360px"
        />
        {/* bottom scrim so pips + edge read over bright art */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 -34px 30px -20px rgba(10,8,4,.66)' }}
        />
        <span
          className="num absolute top-2.5 left-2.5 z-[2] grid size-6 place-items-center rounded-full text-[12px] font-bold"
          style={{
            background: 'rgba(12,10,6,.72)',
            color: '#eadfbe',
            boxShadow: '0 0 0 1px rgba(201,168,85,.55)',
          }}
        >
          {rankNum}
        </span>
        <span className="absolute right-2.5 bottom-2 z-[2]">
          <ManaPips colors={row.color} size={17} />
        </span>
      </div>
      <div className="flex items-baseline gap-2.5 px-3.5 pt-2.5 pb-3">
        <span className="font-display text-ink text-[16.5px] font-bold tracking-[0.01em]">
          {row.name}
        </span>
        <span className="ml-auto flex items-baseline gap-3 whitespace-nowrap">
          <span className="num text-ink-2 text-[13px]">
            {pct1(row.share)} meta
          </span>
          <span className={cn('num text-[13px] font-bold', TONE_CLASS[tone])}>
            {pct1(row.wr)}
          </span>
        </span>
      </div>
    </Link>
  )
}

export default DeckTile
