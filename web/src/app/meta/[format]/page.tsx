import type { Metadata } from 'next'
import { getDataSource } from '@/datasource'
import { buildHref, parseMetaQuery, parseSort } from '@/lib/params'
import { LensBar } from '@/components/LensBar/LensBar'
import { MetaTable } from '@/components/tables/MetaTable'
import { KpiStat } from '@/components/KpiStat'
import { EmptyState } from '@/components/EmptyState'
import { PresenceBars } from '@/components/charts/PresenceBars'
import { WrPresenceScatter } from '@/components/charts/WrPresenceScatter'
import { WrCiChart } from '@/components/charts/WrCiChart'
import { TierChart } from '@/components/charts/TierChart'

// WP7: add generateStaticParams (per-format default window) + `export const
// revalidate = 3600` + dynamicParams. Non-default searchParams render dynamic,
// memoized by the data layer's unstable_cache (blueprint §2 / §6).

type PageProps = {
  params: Promise<{ format: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** 'duel-commander' → 'Duel Commander'. Cheap display label from a slug. */
function formatLabel(slug: string): string {
  return slug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { format } = await params
  const q = parseMetaQuery(format, await searchParams)
  const canonical = buildHref(q.format, q)
  // WP7: switch to lib/seo helper (WP6 owns web/src/lib/seo.ts).
  const og = `/og?view=meta&format=${q.format}&start=${q.start}&end=${q.end}`
  return {
    title: `${formatLabel(format)} Metagame`,
    description: `${formatLabel(format)} tournament metagame — presence, win rates and tiers for ${q.start} to ${q.end}.`,
    alternates: { canonical },
    openGraph: {
      url: canonical,
      images: [{ url: og, width: 1200, height: 630 }],
    },
  }
}

export default async function MetaOverviewPage({
  params,
  searchParams,
}: PageProps) {
  const { format } = await params
  const sp = await searchParams
  const q = parseMetaQuery(format, sp)
  const sort = parseSort(sp)

  const ds = getDataSource()
  const [formats, report] = await Promise.all([
    ds.listFormats(),
    ds.getMetaReport(q),
  ])

  return (
    <main className="mx-auto max-w-6xl px-6 pt-20 pb-16">
      <LensBar format={q.format} formats={formats} />

      {report.rows.length === 0 ? (
        <EmptyState
          title="No data for this window"
          description={`No ${formatLabel(format)} tournaments were recorded between ${q.start} and ${q.end}. Widen the window or pick another format.`}
        />
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KpiStat label="Tournaments" value={report.kpis.tournaments} />
            <KpiStat label="Entries" value={report.kpis.entries} />
            <KpiStat label="Matches" value={report.kpis.matches} />
          </section>

          <section className="mt-8">
            <MetaTable report={report} query={q} sort={sort} />
          </section>

          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PresenceBars rows={report.rows} />
            <WrPresenceScatter rows={report.rows} />
            <WrCiChart rows={report.rows} />
            <TierChart rows={report.rows} />
          </section>
        </>
      )}
    </main>
  )
}
