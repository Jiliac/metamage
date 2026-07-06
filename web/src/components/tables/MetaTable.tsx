'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { cn } from '@/lib/utils'
import { buildHref } from '@/lib/params'
import { ArtCrop } from '@/components/ArtCrop'
import { ManaPips } from '@/components/ManaPips'
import { BucketBadge } from '@/components/BucketBadge'
import type {
  ArchetypeRowDTO,
  FormatSlug,
  MetaQuery,
  MetaSort,
} from '@/datasource/types'

// ---------------------------------------------------------------------------
// MetaTable — the ledger, ranked (§6, §9). A tanstack table over
// ArchetypeRowDTO[] wearing the spike's `.ledger` treatment: uppercase tracked
// headers, a numbered rank index, a 58×36 art thumb, mana pips + name link
// (buildHref preserves the lens), a tier chip, a gold sharebar with a gold cap,
// a CI-toned win rate, the interval, the record, and match count. Server-
// renderable shell; sorting is client-side. A footer strip surfaces the hidden
// buckets and the below-floor reveal.
// ---------------------------------------------------------------------------

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`
const RIGHT = new Set(['wrlo', 'ci', 'record', 'matches'])
const SORTABLE = new Set(['rank', 'tier', 'share', 'wrlo', 'matches'])

// Numeric sort accessors per sortable column — mirror the column accessorFns.
// Sorting is applied manually (below) over non-bucket rows only, so buckets
// always sink to the bottom regardless of the sort key (server sortRows
// invariant), instead of intermixing on a client-seeded wrlo/desc re-sort.
const SORT_ACCESSOR: Record<string, (r: ArchetypeRowDTO) => number> = {
  rank: r => r.presenceRank,
  tier: r => r.tier ?? Number.POSITIVE_INFINITY,
  share: r => r.share,
  wrlo: r => r.wrLo,
  matches: r => r.matches,
}

/** Win-rate tone from the clustered CI position (§9 rule 2). */
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

/** Map the initial `?sort` key onto a tanstack sorting state. */
function initialSorting(sort: MetaSort | undefined): SortingState {
  switch (sort) {
    case 'wrlo':
      return [{ id: 'wrlo', desc: true }]
    case 'tier':
      return [{ id: 'tier', desc: false }]
    default:
      return [{ id: 'rank', desc: false }]
  }
}

function TierChip({ tier }: { tier: ArchetypeRowDTO['tier'] }) {
  if (tier === null) return <span className="text-ink-3">—</span>
  const filled = tier <= 1
  const outline = tier === 1.5
  return (
    <span
      className={cn(
        'inline-block border px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em] whitespace-nowrap',
        filled && 'bg-gold border-gold text-bg',
        outline && 'border-gold-soft text-gold',
        !filled && !outline && 'border-line-strong text-ink-3'
      )}
    >
      {/* Display bands 1-based (best = T1) to match the spike + MTG convention;
          the stored band stays 0-based for the tier math (§9, no "T0"). */}
      T{tier + 1}
    </span>
  )
}

function ShareBar({ share, max }: { share: number; max: number }) {
  const w = max > 0 ? (share / max) * 100 : 0
  return (
    <div className="flex min-w-[180px] items-center gap-2.5">
      <div className="bg-raised relative h-3.5 flex-1">
        <div
          className="bg-gold-soft absolute top-0.5 bottom-0.5 left-0.5"
          style={{ width: `calc(${w}% - 2px)` }}
        >
          <span className="bg-gold absolute top-0 right-0 bottom-0 w-[3px]" />
        </div>
      </div>
      <span className="num text-ink-2 w-12 text-[12px]">{pct1(share)}</span>
    </div>
  )
}

function NameCell({
  row,
  query,
  format,
}: {
  row: ArchetypeRowDTO
  query: MetaQuery
  format: FormatSlug
}) {
  const href = buildHref(format, query, {
    path: `/archetype/${row.slug}`,
  })
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="border-line-strong bg-raised relative block h-9 w-[58px] flex-none overflow-hidden rounded-[4px] border"
        aria-hidden
      >
        <ArtCrop
          url={row.art?.artCropUrl ?? null}
          colors={row.color}
          cardName={row.art?.cardName}
          radius={4}
          sizes="58px"
        />
      </span>
      <ManaPips colors={row.color} />
      {row.isBucket ? (
        <span className="text-ink-3 inline-flex items-center gap-2 font-semibold">
          {row.name}
          <BucketBadge kind={row.slug} />
        </span>
      ) : (
        <Link
          href={href}
          className="text-ink hover:text-gold font-semibold hover:underline hover:underline-offset-[3px]"
        >
          {row.name}
        </Link>
      )}
    </div>
  )
}

export type MetaTableProps = {
  rows: ArchetypeRowDTO[]
  /** The active lens — name links serialize against it (buildHref). */
  query: MetaQuery
  /** Format segment for hrefs; defaults to `query.format`. */
  format?: FormatSlug
  /** Initial sort key from `?sort`; sorting is then client-side. */
  sort?: MetaSort
  /** Collapsed-tail summary rendered as a muted final row. */
  other?: { share: number; matches: number } | null
  /** Hidden bucket shares (0..1) for the footer strip. */
  hiddenBuckets?: { unknown?: number; conflict?: number } | null
  /** Link that flips `?buckets=show`. */
  showBucketsHref?: string
  /** Below-floor reveal (count + a link that lowers `?min` / forces them in). */
  belowFloor?: { count: number; href?: string } | null
  className?: string
}

export function MetaTable({
  rows,
  query,
  format,
  sort,
  other,
  hiddenBuckets,
  showBucketsHref,
  belowFloor,
  className,
}: MetaTableProps) {
  const fmt = format ?? query.format
  const [sorting, setSorting] = React.useState<SortingState>(() =>
    initialSorting(sort)
  )
  const maxShare = React.useMemo(
    () => Math.max(0, ...rows.map(r => r.share)),
    [rows]
  )

  // Apply the sort ourselves over the non-bucket rows, then append buckets last.
  // Buckets are pinned to the bottom (never fed through the sort) so a
  // client-seeded ?sort=wrlo (desc) can't float unknown/conflict above ranked
  // archetypes — matching the server's buckets-sink invariant (§7/§9).
  const sortedRows = React.useMemo(() => {
    const nonBucket = rows.filter(r => !r.isBucket)
    const buckets = rows.filter(r => r.isBucket)
    const s = sorting[0]
    const get = s ? SORT_ACCESSOR[s.id] : undefined
    if (s && get) {
      nonBucket.sort((a, b) => {
        const d = get(a) - get(b)
        return s.desc ? -d : d
      })
    }
    return [...nonBucket, ...buckets]
  }, [rows, sorting])

  const columns = React.useMemo<ColumnDef<ArchetypeRowDTO>[]>(
    () => [
      {
        id: 'rank',
        header: '#',
        accessorFn: r => r.presenceRank,
        cell: ({ row }) => (
          <span className="num text-ink-2 text-[12px]">
            {row.original.presenceRank}
          </span>
        ),
      },
      {
        id: 'name',
        header: 'Archetype',
        enableSorting: false,
        cell: ({ row }) => (
          <NameCell row={row.original} query={query} format={fmt} />
        ),
      },
      {
        id: 'tier',
        header: 'Tier',
        accessorFn: r => r.tier ?? Number.POSITIVE_INFINITY,
        cell: ({ row }) => <TierChip tier={row.original.tier} />,
      },
      {
        id: 'share',
        header: 'Share of matches',
        accessorFn: r => r.share,
        sortDescFirst: true,
        cell: ({ row }) => (
          <ShareBar share={row.original.share} max={maxShare} />
        ),
      },
      {
        id: 'wrlo',
        header: 'Win rate',
        accessorFn: r => r.wrLo,
        sortDescFirst: true,
        cell: ({ row }) => {
          const r = row.original
          const tone = wrTone(r.wrLo, r.wrHi)
          return (
            <span className={cn('num font-bold', TONE_CLASS[tone])}>
              {pct1(r.wr)}
            </span>
          )
        },
      },
      {
        id: 'ci',
        header: '95% CI',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          return (
            <span className="num text-ink-2 text-[11.5px]">
              {(r.wrLo * 100).toFixed(1)}–{(r.wrHi * 100).toFixed(1)}
            </span>
          )
        },
      },
      {
        id: 'record',
        header: 'Record',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          return (
            <span className="num text-ink">
              {r.wins}–{r.losses}
              {r.draws > 0 ? `–${r.draws}` : ''}
            </span>
          )
        },
      },
      {
        id: 'matches',
        header: 'Matches',
        accessorFn: r => r.matches,
        sortDescFirst: true,
        cell: ({ row }) => (
          <span className="num text-ink">
            {row.original.matches.toLocaleString('en-US')}
          </span>
        ),
      },
    ],
    [query, fmt, maxShare]
  )

  const table = useReactTable({
    data: sortedRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    // We pre-sort (buckets pinned bottom) and hand tanstack the final order.
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  })

  const colCount = table.getVisibleFlatColumns().length

  return (
    <div
      className={cn('bg-surface border-line shadow-ledger border', className)}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
                  const id = header.column.id
                  const sortable = SORTABLE.has(id)
                  const sorted = header.column.getIsSorted()
                  const ariaSort: React.AriaAttributes['aria-sort'] = sortable
                    ? sorted === 'asc'
                      ? 'ascending'
                      : sorted === 'desc'
                        ? 'descending'
                        : 'none'
                    : undefined
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ariaSort}
                      tabIndex={sortable ? 0 : undefined}
                      onClick={
                        sortable
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                      onKeyDown={
                        sortable
                          ? e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                header.column.toggleSorting()
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        'border-line-strong text-ink-2 border-b px-3.5 pt-3 pb-[9px] text-[11px] font-semibold tracking-[0.13em] whitespace-nowrap uppercase select-none',
                        RIGHT.has(id) ? 'text-right' : 'text-left',
                        id === 'rank' && 'w-[30px]',
                        id === 'name' && 'min-w-[240px]',
                        sortable &&
                          'hover:text-ink focus-visible:text-ink cursor-pointer'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          RIGHT.has(id) && 'flex-row-reverse'
                        )}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {sortable && (
                          <span className="text-gold w-2 text-[10px]">
                            {sorted === 'asc'
                              ? '↑'
                              : sorted === 'desc'
                                ? '↓'
                                : ''}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {table.getRowModel().rows.map(row => (
              <tr
                key={row.id}
                className={cn(
                  'hover:bg-gold-wash',
                  row.original.isBucket && 'opacity-70'
                )}
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    className={cn(
                      'border-line border-b px-3.5 py-[7px] align-middle',
                      RIGHT.has(cell.column.id) && 'text-right'
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {other && (
              <tr className="text-ink-3">
                <td className="border-line border-b px-3.5 py-[7px]" />
                <td className="border-line border-b px-3.5 py-[7px] font-semibold italic">
                  Other (collapsed tail)
                </td>
                <td className="border-line border-b px-3.5 py-[7px]">—</td>
                <td className="border-line border-b px-3.5 py-[7px]">
                  <ShareBar share={other.share} max={maxShare} />
                </td>
                <td className="border-line border-b px-3.5 py-[7px] text-right">
                  —
                </td>
                <td className="border-line border-b px-3.5 py-[7px] text-right">
                  —
                </td>
                <td className="border-line border-b px-3.5 py-[7px] text-right">
                  —
                </td>
                <td className="num border-line border-b px-3.5 py-[7px] text-right">
                  {other.matches.toLocaleString('en-US')}
                </td>
              </tr>
            )}
            {table.getRowModel().rows.length === 0 && !other && (
              <tr>
                <td
                  colSpan={colCount}
                  className="text-ink-3 px-3.5 py-6 text-center"
                >
                  No archetypes clear the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(hiddenBuckets || belowFloor) && (
        <div className="border-line text-ink-3 flex flex-wrap items-center gap-4 border-t px-3.5 py-2.5 text-[12.5px]">
          {hiddenBuckets && (
            <span>
              Buckets hidden:{' '}
              <span className="num">
                {hiddenBuckets.unknown !== undefined &&
                  `unknown ${(hiddenBuckets.unknown * 100).toFixed(1)}%`}
                {hiddenBuckets.unknown !== undefined &&
                  hiddenBuckets.conflict !== undefined &&
                  ' · '}
                {hiddenBuckets.conflict !== undefined &&
                  `conflict ${(hiddenBuckets.conflict * 100).toFixed(1)}%`}
              </span>
            </span>
          )}
          {showBucketsHref && (
            <Link
              href={showBucketsHref}
              className="text-gold underline underline-offset-[3px]"
            >
              show buckets
            </Link>
          )}
          {belowFloor && belowFloor.count > 0 && (
            <span className="ml-auto">
              {belowFloor.count} archetype{belowFloor.count === 1 ? '' : 's'}{' '}
              below the floor
              {belowFloor.href ? (
                <>
                  {' — '}
                  <Link
                    href={belowFloor.href}
                    className="text-gold underline underline-offset-[3px]"
                  >
                    reveal
                  </Link>
                </>
              ) : null}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default MetaTable
