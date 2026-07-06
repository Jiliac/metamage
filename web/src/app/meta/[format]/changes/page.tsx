import type { Metadata } from 'next'
import { Suspense } from 'react'

import { getDataSource } from '@/datasource'
import type { ArchetypeRef, FormatDTO, MetaChangeDTO } from '@/datasource/types'
import { parseMetaQuery } from '@/lib/params'
import { buildPageMetadata } from '@/lib/seo'

import { LensBar } from '@/components/LensBar/LensBar'
import { EmptyState } from '@/components/EmptyState'

// ---------------------------------------------------------------------------
// Changes route (WP5) — bans & set releases that annotate the format's windows.
// RSC. Format-level data (window-independent), rendered as a vertical timeline.
// ---------------------------------------------------------------------------

type RouteParams = { format: string }
type SearchParams = Record<string, string | string[] | undefined>

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] // prettier-ignore

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function formatName(formats: FormatDTO[], slug: string): string {
  return formats.find(f => f.slug === slug)?.name ?? titleCase(slug)
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

// Format-level timeline — SSG per format, refreshed daily (blueprint §2).
export const revalidate = 86400
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
    path: '/changes',
    title: `${name} Bans & Releases`,
    description: `Timeline of bans and set releases shaping the ${name} metagame.`,
  })
}

export default async function ChangesPage({
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
  const [formats, changes, archetypes]: [
    FormatDTO[],
    MetaChangeDTO[],
    ArchetypeRef[],
  ] = await Promise.all([
    ds.listFormats(),
    ds.getFormatMetaChanges(query.format),
    ds.searchArchetypes(query.format, ''),
  ])
  const fmtName = formatName(formats, format)

  // Most recent first.
  const ordered = [...changes].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <Suspense fallback={null}>
        <LensBar formats={formats} archetypes={archetypes} />
      </Suspense>

      <section className="mt-10">
        <p className="eyebrow mb-1.5">The record</p>
        <h2 className="font-display text-[clamp(24px,4vw,34px)] font-bold">
          {fmtName} bans &amp; releases
        </h2>
        <p className="mt-0.5 max-w-[65ch] text-[13.5px] text-ink-2">
          Every ban and set release that moved the format. These mark the
          boundaries between metagames — read any window against the change that
          opened it.
        </p>

        {ordered.length === 0 ? (
          <EmptyState
            title="No recorded changes"
            message={`We have no bans or set releases on file for ${fmtName} yet.`}
          />
        ) : (
          <ol className="mt-6 border-l border-line-strong">
            {ordered.map((c, i) => (
              <TimelineEntry key={`${c.date}-${i}`} change={c} />
            ))}
          </ol>
        )}
      </section>

      <footer className="mt-[72px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[18px] text-[12.5px] text-ink-3">
        <span>
          Source: Wizards of the Coast banned &amp; restricted announcements
        </span>
      </footer>
    </>
  )
}

function TimelineEntry({ change }: { change: MetaChangeDTO }) {
  const isBan = change.type === 'BAN'
  return (
    <li className="relative py-4 pl-6">
      <span
        className="absolute top-[22px] -left-[5px] h-2.5 w-2.5 rounded-full"
        style={{ background: isBan ? 'var(--bad)' : 'var(--gold)' }}
        aria-hidden
      />
      <div className="flex flex-wrap items-baseline gap-3">
        <time className="data text-[12.5px] text-ink-3">
          {longDate(change.date)}
        </time>
        <span
          className="inline-block border px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] uppercase"
          style={{
            borderColor: isBan ? 'var(--bad)' : 'var(--gold-soft)',
            color: isBan ? 'var(--bad)' : 'var(--gold)',
          }}
        >
          {isBan ? 'Ban' : 'Set release'}
        </span>
        {change.setCode && (
          <span className="data text-[12px] text-ink-3">{change.setCode}</span>
        )}
      </div>
      <p className="mt-1.5 text-[14px] text-ink">{change.description}</p>
    </li>
  )
}
