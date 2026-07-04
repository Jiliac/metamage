import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getDataSource } from '@/datasource'
import { asArchetypeSlug, buildHref, parseMetaQuery } from '@/lib/params'
import type { MatchupCellDTO } from '@/datasource/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CardAdoptionTable } from '@/components/tables/CardAdoptionTable'
import { TrendChart } from '@/components/charts/TrendChart'
import { WrCiChart } from '@/components/charts/WrCiChart'
import { KpiStat } from '@/components/KpiStat'
import { EmptyState } from '@/components/EmptyState'
import { BucketBadge } from '@/components/BucketBadge'
import { LowSampleNotice } from '@/components/LowSampleNotice'

// WP7: add generateStaticParams (prebuild top-N archetypes per format @ default
// window; long tail dynamic) + revalidate.

const TABS = ['decklists', 'matchups', 'trends', 'performance'] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  decklists: 'Decklists',
  matchups: 'Matchups',
  trends: 'Trends',
  performance: 'Performance',
}

function parseTab(raw: string | string[] | undefined): Tab {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (TABS as readonly string[]).includes(v ?? '')
    ? (v as Tab)
    : 'decklists'
}

type PageProps = {
  params: Promise<{ format: string; slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { format, slug } = await params
  const q = parseMetaQuery(format, await searchParams)
  const ds = getDataSource()
  const ref = await ds.resolveSlug(q.format, asArchetypeSlug(slug))
  const name = ref?.name ?? slug
  const canonical = buildHref(q.format, q, { path: `/archetype/${slug}` })
  // WP7: switch to lib/seo helper (WP6 owns web/src/lib/seo.ts).
  const og = `/og?view=archetype&format=${q.format}&slug=${slug}&start=${q.start}&end=${q.end}`
  return {
    title: name,
    description: `${name} in ${format} — decklists, matchups, trends and performance for ${q.start} to ${q.end}.`,
    alternates: { canonical },
    openGraph: {
      url: canonical,
      images: [{ url: og, width: 1200, height: 630 }],
    },
  }
}

export default async function ArchetypeDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { format, slug } = await params
  const sp = await searchParams
  const q = parseMetaQuery(format, sp)
  const tab = parseTab(sp.tab)

  const ds = getDataSource()

  // Slug discipline: canonical slugs only. Stale/renamed slugs redirect; unknown
  // slugs 404 (blueprint §2 / pitfall #4).
  const ref = await ds.resolveSlug(q.format, asArchetypeSlug(slug))
  if (!ref) notFound()
  if (ref.slug !== slug) {
    redirect(buildHref(q.format, q, { path: `/archetype/${ref.slug}`, tab }))
  }

  const detail = await ds.getArchetypeDetail({ ...q, slug: ref.slug })
  if (!detail) notFound()

  const hrefFor = (t: Tab) =>
    buildHref(q.format, q, { path: `/archetype/${ref.slug}`, tab: t })

  return (
    <main className="mx-auto max-w-6xl px-6 pt-20 pb-16">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href={buildHref(q.format, q)}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {formatLabel(format)}
        </Link>
        <h1 className="text-2xl font-semibold">{detail.archetype.name}</h1>
        {detail.summary.color && (
          <span className="text-muted-foreground font-mono text-sm">
            {detail.summary.color}
          </span>
        )}
        {detail.summary.tier !== null && (
          <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs font-medium">
            Tier {detail.summary.tier}
          </span>
        )}
        {detail.summary.isBucket && <BucketBadge />}
      </header>

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiStat label="Tournaments" value={detail.kpis.tournaments} />
        <KpiStat label="Entries" value={detail.kpis.entries} />
        <KpiStat label="Matches" value={detail.kpis.matches} />
      </section>

      <Tabs value={tab} className="mt-8">
        <TabsList>
          {TABS.map(t => (
            <TabsTrigger key={t} value={t} asChild>
              <Link href={hrefFor(t)}>{TAB_LABELS[t]}</Link>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-6">
          {tab === 'decklists' && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div>
                <h2 className="mb-2 text-sm font-semibold">Maindeck</h2>
                <CardAdoptionTable cards={detail.mainCards} board="MAIN" />
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold">Sideboard</h2>
                <CardAdoptionTable cards={detail.sideCards} board="SIDE" />
              </div>
            </div>
          )}

          {tab === 'matchups' && <MatchupList cells={detail.matchups} />}

          {tab === 'trends' && <TrendChart points={detail.trends} />}

          {tab === 'performance' && (
            <div className="space-y-4">
              <LowSampleNotice />
              <WrCiChart rows={[detail.summary]} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  )
}

/** 'duel-commander' → 'Duel Commander'. Cheap display label from a slug. */
function formatLabel(slug: string): string {
  return slug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

// A plain server-rendered matchups list. WP2's MatchupMatrix single-row variant
// (blueprint §6) can replace this at integration; the list here keeps the page
// type-safe against the known MatchupCellDTO contract in the meantime.
function MatchupList({ cells }: { cells: MatchupCellDTO[] }) {
  const rows = cells.filter(c => !c.isMirror)
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No matchup data"
        description="No recorded matches against other archetypes in this window."
      />
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Opponent</TableHead>
          <TableHead className="text-right">W–L–D</TableHead>
          <TableHead className="text-right">WR</TableHead>
          <TableHead className="text-right">95% CI</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(c => (
          <TableRow key={c.colSlug}>
            <TableCell>{c.colName}</TableCell>
            <TableCell className="text-right font-mono">
              {c.lowN ? '–' : `${c.wins}–${c.losses}–${c.draws}`}
            </TableCell>
            <TableCell className="text-right font-mono">
              {c.lowN ? '–' : `${Math.round(c.wr * 100)}%`}
            </TableCell>
            <TableCell className="text-muted-foreground text-right font-mono">
              {c.lowN
                ? '–'
                : `${Math.round(c.ciLow * 100)}–${Math.round(c.ciHigh * 100)}%`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
