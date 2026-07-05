import type { Metadata } from 'next'
import { Suspense } from 'react'

import { getDataSource } from '@/datasource'
import type {
  ArchetypeRef,
  FormatDTO,
  SourceDTO,
  TournamentDTO,
} from '@/datasource/types'
import { parseMetaQuery } from '@/lib/params'
import { buildPageMetadata } from '@/lib/seo'

import { LensBar } from '@/components/LensBar/LensBar'
import { EmptyState } from '@/components/EmptyState'
import { KpiStat } from '@/components/KpiStat'

// ---------------------------------------------------------------------------
// Tournaments route (WP5) — the events + source breakdown feeding the window.
// RSC. Source cards on top, the full tournament list below.
// ---------------------------------------------------------------------------

type RouteParams = { format: string }
type SearchParams = Record<string, string | string[] | undefined>

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] // prettier-ignore

const SOURCE_LABEL: Record<TournamentDTO['source'], string> = {
  MTGO: 'Magic Online',
  MELEE: 'Melee.gg',
  CARDSREALM: 'Cardsrealm',
  OTHER: 'Other',
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function formatName(formats: FormatDTO[], slug: string): string {
  return formats.find(f => f.slug === slug)?.name ?? titleCase(slug)
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

// Dynamic (window-driven) + cached by the data layer (blueprint §2). The
// default-window shell is prebuilt per format; other windows render on demand.
export const revalidate = 3600
export const dynamicParams = true

export async function generateStaticParams(): Promise<RouteParams[]> {
  const formats = await getDataSource().listFormats()
  return formats.map(f => ({ format: String(f.slug) }))
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
    title: `${name} Tournaments`,
    description: `Events and source breakdown feeding the ${name} metagame window.`,
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
    ds.searchArchetypes(query.format, ''),
  ])
  const fmtName = formatName(formats, format)

  const totalEntries = sources.reduce((s, x) => s + x.entries, 0)
  const totalEvents = sources.reduce((s, x) => s + x.tournaments, 0)

  return (
    <>
      <Suspense fallback={null}>
        <LensBar formats={formats} archetypes={archetypes} />
      </Suspense>

      <section className="mt-10">
        <p className="eyebrow mb-1.5">The feed</p>
        <h2 className="font-display text-[clamp(24px,4vw,34px)] font-bold">
          {fmtName} tournaments
        </h2>
        <p className="mt-0.5 max-w-[65ch] text-[13.5px] text-ink-2">
          Every event in the window, and where the data comes from. The matrix
          and the field above are built from exactly these results.
        </p>

        {tournaments.length === 0 ? (
          <EmptyState
            title="No tournaments in this window"
            message={`We have no ${fmtName} events for ${query.start} → ${query.end}. Widen the window to see the feed.`}
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
            <div className="mt-6 overflow-x-auto border border-line bg-surface shadow-ledger">
              <table className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Tournament</Th>
                    <Th>Source</Th>
                    <Th className="text-right">Entries</Th>
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map(t => (
                    <tr key={t.id} className="hover:bg-[var(--gold-wash)]">
                      <td className="border-b border-line px-3.5 py-2">
                        <span className="data text-ink-2">
                          {shortDate(t.date)}
                        </span>
                      </td>
                      <td className="border-b border-line px-3.5 py-2 font-semibold text-ink">
                        {t.link ? (
                          <a
                            href={t.link}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-gold hover:underline hover:underline-offset-[3px]"
                          >
                            {t.name}
                          </a>
                        ) : (
                          t.name
                        )}
                      </td>
                      <td className="border-b border-line px-3.5 py-2 text-ink-2">
                        {SOURCE_LABEL[t.source]}
                      </td>
                      <td className="border-b border-line px-3.5 py-2 text-right">
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
