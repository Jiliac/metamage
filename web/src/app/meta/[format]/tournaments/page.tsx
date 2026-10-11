import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { getDataSource } from '@/datasource'
import type {
  ArchetypeRef,
  FormatDTO,
  SourceDTO,
  TournamentDTO,
} from '@/datasource/types'
import { ALL_FORMATS, isAllFormats } from '@/datasource/format-order'
import { buildHref, parseMetaQuery } from '@/lib/params'
import { shortDate } from '@/lib/dates'
import { SOURCE_LABEL } from '@/lib/events'
import { buildPageMetadata } from '@/lib/seo'
import { cn } from '@/lib/utils'
import { STICKY_COL_DATE } from '@/components/tables/sticky'

import { LensBar } from '@/components/LensBar/LensBar'
import { EmptyState } from '@/components/EmptyState'
import { KpiStat } from '@/components/KpiStat'

// ---------------------------------------------------------------------------
// Tournaments route (WP5) — the events + source breakdown feeding the window.
// RSC. Source cards on top, the full tournament list below; each event links
// to its standings page. `/meta/all/tournaments` lists every format (with a
// Format column).
// ---------------------------------------------------------------------------

type RouteParams = { format: string }
type SearchParams = Record<string, string | string[] | undefined>

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function formatName(formats: FormatDTO[], slug: string): string {
  if (isAllFormats(slug)) return 'All formats'
  return formats.find(f => f.slug === slug)?.name ?? titleCase(slug)
}

function formatChip(formats: FormatDTO[], slug: string): string {
  return formats.find(f => f.slug === slug)?.displayName ?? titleCase(slug)
}

// Dynamic (window-driven) + cached by the data layer (blueprint §2). The
// default-window shell is prebuilt per format; other windows render on demand.
export const revalidate = 3600
export const dynamicParams = true

export async function generateStaticParams(): Promise<RouteParams[]> {
  const formats = await getDataSource().listFormats()
  return [
    { format: ALL_FORMATS },
    ...formats.map(f => ({ format: String(f.slug) })),
  ]
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { format } = await params
  const sp = await searchParams
  const query = parseMetaQuery(format, sp)
  const formats = await getDataSource().listFormats()
  const name = formatName(formats, format)
  return buildPageMetadata({
    view: 'meta',
    format,
    query,
    path: '/tournaments',
    title: isAllFormats(format) ? 'Tournaments' : `${name} Tournaments`,
    description: isAllFormats(format)
      ? 'Every tournament in the window, across all formats, with standings.'
      : `Events and source breakdown feeding the ${name} metagame window.`,
  })
}

export default async function TournamentsPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}) {
  const { format } = await params
  const sp = await searchParams

  const query = parseMetaQuery(format, sp)
  const isAll = isAllFormats(format)

  const ds = getDataSource()
  const [formats, sources, tournaments, archetypes]: [
    FormatDTO[],
    SourceDTO[],
    TournamentDTO[],
    ArchetypeRef[],
  ] = await Promise.all([
    ds.listFormats(),
    ds.getSources(query),
    ds.getTournaments(query),
    isAll ? Promise.resolve([]) : ds.searchArchetypes(query.format, ''),
  ])
  const fmtName = formatName(formats, format)
  const heading = isAll ? 'All tournaments' : `${fmtName} tournaments`
  const eventHref = (id: string) =>
    buildHref(format, query, { path: `/tournaments/${id}` })

  const totalEntries = sources.reduce((s, x) => s + x.entries, 0)
  const totalEvents = sources.reduce((s, x) => s + x.tournaments, 0)

  return (
    <>
      <Suspense fallback={null}>
        <LensBar
          formats={formats}
          archetypes={archetypes}
          variant="tournaments"
        />
      </Suspense>

      <section className="mt-10">
        <p className="eyebrow mb-1.5">Events</p>
        <h1 className="font-display text-[clamp(24px,4vw,34px)] font-bold">
          {heading}
        </h1>
        <p className="mt-0.5 max-w-[65ch] text-[13.5px] text-ink-2">
          {isAll
            ? 'Every event in the window, across every format. Open one for its standings, field and matchups.'
            : 'Every event in the window, and where the data comes from. The ranking and the matrix are built from exactly these results. Open one for its standings.'}
        </p>

        {tournaments.length === 0 ? (
          <EmptyState
            title="No tournaments in this window"
            message={`We have no ${isAll ? '' : `${fmtName} `}events for ${query.start} → ${query.end}. Widen the window to see the feed.`}
          />
        ) : (
          <>
            {/* SOURCE BREAKDOWN */}
            <div className="mt-6 grid gap-px border border-line bg-line [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
              {sources.map(s => (
                <SourceCard key={s.source} source={s} total={totalEntries} />
              ))}
              <KpiStat label="All events" value={totalEvents} />
            </div>

            {/* TOURNAMENT TABLE */}
            <div className="mt-6 overflow-x-auto border border-line bg-surface shadow-ledger max-md:[mask-image:linear-gradient(to_right,#000_calc(100%_-_24px),transparent)] max-md:[-webkit-mask-image:linear-gradient(to_right,#000_calc(100%_-_24px),transparent)]">
              <table className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr>
                    <Th className={STICKY_COL_DATE}>Date</Th>
                    <Th>Tournament</Th>
                    {isAll && <Th>Format</Th>}
                    {/* Below `md` the source folds under the event name so
                        the entries column stays on screen. */}
                    <Th className="hidden md:table-cell">Source</Th>
                    <Th className="text-right">Entries</Th>
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map(t => (
                    <tr
                      key={t.id}
                      className="group hover:bg-[var(--gold-wash)]"
                    >
                      <td
                        className={cn(
                          'border-b border-line px-3.5 py-2 align-top md:align-middle',
                          STICKY_COL_DATE
                        )}
                      >
                        <span className="data text-ink-2">
                          {shortDate(t.date)}
                        </span>
                      </td>
                      <td className="border-b border-line px-3.5 py-2 align-top font-semibold text-ink md:align-middle">
                        <Link
                          href={eventHref(t.id)}
                          className="hover:text-gold hover:underline hover:underline-offset-[3px]"
                        >
                          {t.name}
                        </Link>
                        <span className="mt-0.5 block text-[12px] font-normal text-ink-3 md:hidden">
                          {SOURCE_LABEL[t.source]}
                        </span>
                      </td>
                      {isAll && (
                        <td className="border-b border-line px-3.5 py-2 align-top text-ink-2 md:align-middle">
                          {formatChip(formats, t.format)}
                        </td>
                      )}
                      <td className="hidden border-b border-line px-3.5 py-2 whitespace-nowrap text-ink-2 md:table-cell">
                        {t.link ? (
                          <a
                            href={t.link}
                            target="_blank"
                            rel="noreferrer"
                            title={`Open on ${SOURCE_LABEL[t.source]}`}
                            className="hover:text-gold hover:underline hover:underline-offset-[3px]"
                          >
                            {SOURCE_LABEL[t.source]} ↗
                          </a>
                        ) : (
                          SOURCE_LABEL[t.source]
                        )}
                      </td>
                      <td className="border-b border-line px-3.5 py-2 text-right align-top md:align-middle">
                        <span className="data">{t.entries}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <footer className="mt-[72px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[18px] text-[12.5px] text-ink-3">
        <span>
          Source: MTGO Top32 &amp; Melee · {query.start} → {query.end}
        </span>
      </footer>
    </>
  )
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={`border-b border-line-strong px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-[0.13em] text-ink-3 uppercase ${className}`}
    >
      {children}
    </th>
  )
}

function SourceCard({ source, total }: { source: SourceDTO; total: number }) {
  const pct = total > 0 ? Math.round((source.entries / total) * 100) : 0
  return (
    <div className="bg-surface p-4">
      <div className="data text-[22px] font-semibold">{source.entries}</div>
      <div className="mt-0.5 text-[11.5px] tracking-[0.14em] text-ink-3 uppercase">
        {SOURCE_LABEL[source.source]}
      </div>
      <div className="mt-1 text-[12px] text-ink-2">
        <span className="data">{source.tournaments}</span> events ·{' '}
        <span className="data">{pct}%</span>
      </div>
    </div>
  )
}
