import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getDataSource } from '@/datasource'
import type {
  ArchetypeDetailDTO,
  ArchetypeRef,
  MatchupCellDTO,
} from '@/datasource/types'
import { buildHref, parseMetaQuery, asArchetypeSlug } from '@/lib/params'
import { buildPageMetadata } from '@/lib/seo'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ManaPips } from '@/components/ManaPips'
import { CardAdoptionTable } from '@/components/tables/CardAdoptionTable'
import { TrendChart } from '@/components/charts/TrendChart'
import { WrCiChart } from '@/components/charts/WrCiChart'

// ---------------------------------------------------------------------------
// Archetype detail (WP5). RSC. resolveSlug() first — stale/renamed slugs 302 to
// the canonical URL, unknown slugs 404. Radix tabs are driven by `?tab=`: the
// active tab seeds `defaultValue`; all four panels are server-rendered from the
// single getArchetypeDetail() payload. (WP7 may wire ?tab URL sync on switch.)
// ---------------------------------------------------------------------------

type RouteParams = { format: string; slug: string }
type SearchParams = Record<string, string | string[] | undefined>

const TABS = ['decklists', 'matchups', 'trends', 'performance'] as const
type TabKey = (typeof TABS)[number]

function readTab(sp: SearchParams): TabKey {
  const raw = sp['tab']
  const v = Array.isArray(raw) ? raw[0] : raw
  return (TABS as readonly string[]).includes(v ?? '')
    ? (v as TabKey)
    : 'decklists'
}

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`

function tierLabel(tier: number | null): string | null {
  // Display bands 1-based (best = T1) to match the spike + MTG convention; the
  // stored band stays 0-based for the tier math (§9, no "T0").
  return tier === null ? null : `T${tier + 1}`
}

// Prebuild the top-N archetypes per format at the default window (blueprint §2);
// the long tail (rarer archetypes, other windows) renders on demand + cached.
export const revalidate = 3600
export const dynamicParams = true

export async function generateStaticParams(): Promise<
  { format: string; slug: string }[]
> {
  const ds = getDataSource()
  const formats = await ds.listFormats()
  const out: { format: string; slug: string }[] = []
  for (const f of formats) {
    const report = await ds.getMetaReport(parseMetaQuery(String(f.slug), {}))
    for (const row of report.rows) {
      if (!row.isBucket) {
        out.push({ format: String(f.slug), slug: String(row.slug) })
      }
    }
  }
  return out
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { format, slug } = await params
  const sp = await searchParams
  const query = parseMetaQuery(format, sp)
  const tab = readTab(sp)
  const ds = getDataSource()
  const ref = await ds.resolveSlug(query.format, asArchetypeSlug(slug))
  const name = ref?.name ?? slug
  const fmtName = format.charAt(0).toUpperCase() + format.slice(1)
  return buildPageMetadata({
    view: 'archetype',
    format,
    query,
    slug: ref?.slug ?? asArchetypeSlug(slug),
    tab: tab === 'decklists' ? undefined : tab,
    title: `${name} — ${fmtName}`,
    description: `Decklists, matchups, trends and performance for ${name}.`,
  })
}

export default async function ArchetypeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}) {
  const { format, slug } = await params
  const sp = await searchParams

  const query = parseMetaQuery(format, sp)
  const tab = readTab(sp)
  const ds = getDataSource()

  // Slug discipline: redirect stale slugs, 404 unknown ones.
  const canonical: ArchetypeRef | null = await ds.resolveSlug(
    query.format,
    asArchetypeSlug(slug)
  )
  if (!canonical) notFound()
  if (canonical.slug !== slug) {
    redirect(
      buildHref(query.format, query, {
        path: `/archetype/${canonical.slug}`,
        // Omit the default tab so the canonical redirect target stays clean.
        tab: tab === 'decklists' ? undefined : tab,
      })
    )
  }

  const detail: ArchetypeDetailDTO | null = await ds.getArchetypeDetail({
    ...query,
    slug: canonical.slug,
  })
  if (!detail) notFound()

  const { archetype, summary } = detail
  const tier = tierLabel(summary.tier)
  const record = `${summary.wins}-${summary.losses}-${summary.draws}`

  const nonMirror = detail.matchups
    .filter(m => !m.isMirror)
    .sort((a, b) => b.wr - a.wr)

  const tabHref = (t: TabKey) =>
    buildHref(query.format, query, {
      path: `/archetype/${canonical.slug}`,
      tab: t,
    })

  return (
    <>
      {/* ---- HEADER ---- */}
      <header className="mt-6">
        <p className="eyebrow mb-1.5">
          Archetype · {format[0]?.toUpperCase()}
          {format.slice(1)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ManaPips colors={archetype.color} size={17} />
          <h1 className="font-display text-[clamp(26px,4vw,38px)] font-bold">
            {archetype.name}
          </h1>
          {tier && (
            <span className="inline-block border border-gold-soft px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-gold">
              {tier}
            </span>
          )}
        </div>
        <p className="mt-2 text-[13.5px] text-ink-2">
          <span className="data text-ink">{pct1(summary.wr)}</span> win rate ·{' '}
          <span className="data">{record}</span> ·{' '}
          <span className="data">{summary.matches}</span> matches ·{' '}
          <span className="data">{pct1(summary.share)}</span> of the meta
        </p>
      </header>

      {/* ---- TABS (Radix; seeded from ?tab) ---- */}
      <Tabs defaultValue={tab} className="mt-8">
        <TabsList>
          {TABS.map(t => (
            // asChild → the trigger IS the link, so switching tabs rewrites the
            // URL (?tab) and the RSC re-renders with the new active panel (§2).
            <TabsTrigger key={t} value={t} asChild className="capitalize">
              <Link href={tabHref(t)}>{t}</Link>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* DECKLISTS */}
        <TabsContent value="decklists" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="eyebrow mb-2">Maindeck</h3>
              <CardAdoptionTable cards={detail.mainCards} board="MAIN" />
            </div>
            <div>
              <h3 className="eyebrow mb-2">Sideboard</h3>
              <CardAdoptionTable cards={detail.sideCards} board="SIDE" />
            </div>
          </div>
        </TabsContent>

        {/* MATCHUPS — this row vs all (single-row + list) */}
        <TabsContent value="matchups" className="mt-4">
          <MatchupList cells={nonMirror} />
        </TabsContent>

        {/* TRENDS */}
        <TabsContent value="trends" className="mt-4">
          <div className="border border-line bg-surface p-4 shadow-ledger">
            <TrendChart trends={detail.trends} />
          </div>
        </TabsContent>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="mt-4">
          <div className="border border-line bg-surface p-4 shadow-ledger">
            <WrCiChart rows={[summary]} />
          </div>
        </TabsContent>
      </Tabs>

      <footer className="mt-[72px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[18px] text-[12.5px] text-ink-3">
        <span>Card art © Wizards of the Coast, via Scryfall</span>
        <span>
          Every view is a URL — this page is{' '}
          <span className="data">{tabHref(tab)}</span>
        </span>
      </footer>
    </>
  )
}

// Simple server-rendered matchup list (skeleton fallback for the single-row
// matrix; WP7/WP2 may swap in a MatchupMatrix single-row variant).
function MatchupList({ cells }: { cells: MatchupCellDTO[] }) {
  if (cells.length === 0) {
    return (
      <p className="py-8 text-center text-[13.5px] text-ink-3">
        No recorded matchups for this archetype in the window.
      </p>
    )
  }
  const cls = (c: MatchupCellDTO) =>
    c.ciLow > 0.5 ? 'text-good' : c.ciHigh < 0.5 ? 'text-bad' : 'text-ink'
  return (
    <div className="overflow-x-auto border border-line bg-surface shadow-ledger">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            <th className="border-b border-line-strong px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-[0.13em] text-ink-3 uppercase">
              Opponent
            </th>
            <th className="border-b border-line-strong px-3.5 py-2.5 text-right text-[11px] font-semibold tracking-[0.13em] text-ink-3 uppercase">
              Win rate
            </th>
            <th className="border-b border-line-strong px-3.5 py-2.5 text-right text-[11px] font-semibold tracking-[0.13em] text-ink-3 uppercase">
              Record
            </th>
            <th className="border-b border-line-strong px-3.5 py-2.5 text-right text-[11px] font-semibold tracking-[0.13em] text-ink-3 uppercase">
              Matches
            </th>
          </tr>
        </thead>
        <tbody>
          {cells.map(c => (
            <tr
              key={`${c.rowSlug}-${c.colSlug}`}
              className="hover:bg-[var(--gold-wash)]"
            >
              <td className="border-b border-line px-3.5 py-2 text-ink">
                {c.colName}
              </td>
              <td className="border-b border-line px-3.5 py-2 text-right">
                {c.lowN ? (
                  <span className="data text-ink-3">–</span>
                ) : (
                  <span className={`data font-bold ${cls(c)}`}>
                    {(c.wr * 100).toFixed(0)}%
                  </span>
                )}
              </td>
              <td className="border-b border-line px-3.5 py-2 text-right">
                <span className="data">
                  {c.wins}-{c.losses}
                  {c.draws ? `-${c.draws}` : ''}
                </span>
              </td>
              <td className="border-b border-line px-3.5 py-2 text-right">
                <span className="data">{c.games}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
