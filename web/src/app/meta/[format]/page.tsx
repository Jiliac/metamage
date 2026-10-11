import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { getDataSource } from '@/datasource'
import { isAllFormats } from '@/datasource/format-order'
import type {
  ArchetypeRef,
  ArchetypeRowDTO,
  FormatDTO,
  MatrixDTO,
  MetaQuery,
  MetaReportDTO,
} from '@/datasource/types'
import {
  buildArchetypeHrefs,
  buildHref,
  defaultWindow,
  expandPreset,
  parseMetaQuery,
  parseMatrixTopN,
  parseRow,
  parseSort,
} from '@/lib/params'
import { buildPageMetadata } from '@/lib/seo'

import { LensBar } from '@/components/LensBar/LensBar'
import { DeckTile } from '@/components/DeckTile'
import { KpiStat } from '@/components/KpiStat'
import { EmptyState } from '@/components/EmptyState'
import { LowSampleNotice } from '@/components/LowSampleNotice'
import { MetaTable } from '@/components/tables/MetaTable'
import { WrPresenceScatter } from '@/components/charts/WrPresenceScatter'
import { MatchupMatrix } from '@/components/charts/MatchupMatrix'
import { MatrixRowPicker } from '@/components/charts/MatrixRowPicker'
import { MatrixSkeleton } from '@/components/charts/MatrixSkeleton'
import { MatchupList, selectRowCells } from '@/components/tables/MatchupList'

// ---------------------------------------------------------------------------
// Meta overview landing (WP5). All RSC: parse the lens once, resolve the data
// source, compose —
//   LensBar → ledger headline + KPI grid → matrix hero (notched gold frame)
//   → 'Top of the field' compact DeckTile strip → MetaTable panel
//   → scatter panel → footer.
// The matrix comes first because matchups are the moat (PRODUCT.md principle
// 3); the headline states the leader's share and win rate with its interval
// instead of an editorial claim (principle 4). Empty window → EmptyState (§5).
// ---------------------------------------------------------------------------

type RouteParams = { format: string }
type SearchParams = Record<string, string | string[] | undefined>

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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

/** 'June 2026' for a whole calendar month, else 'Jun 1 → Jun 30, 2026'. */
function windowLabel(start: string, end: string): string {
  const [ys, ms, ds] = start.split('-').map(Number)
  const [ye, me, de] = end.split('-').map(Number)
  const lastDay = new Date(Date.UTC(ye, me, 0)).getUTCDate()
  if (ys === ye && ms === me && ds === 1 && de === lastDay) {
    return `${MONTHS[ms - 1]} ${ys}`
  }
  const short = (m: number, d: number) => `${MONTHS[m - 1].slice(0, 3)} ${d}`
  return `${short(ms, ds)} → ${short(me, de)}, ${ye}`
}

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`
const int = (n: number) => n.toLocaleString('en-US')
/** '52.0–55.4%' — the 95% interval as one tabular token. */
const ciRange = (r: ArchetypeRowDTO) =>
  `${(r.wrLo * 100).toFixed(1)}–${pct1(r.wrHi)}`

// A 95% interval ten points wide or more (±5) on the leader is the honest
// signal of a thin window: hedge the headline rather than hide it.
const WIDE_CI = 0.1

// ISR: the default-window landing is prebuilt per format (generateStaticParams);
// any other window/knobs render on demand and are memoized by the data layer
// (blueprint §2 route table, §6, §8-risk-1). dynamicParams=true keeps the long
// tail (new formats) on-demand rather than 404.
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
  const sort = parseSort(sp)
  const formats = await getDataSource().listFormats()
  const name = formatName(formats, format)
  return buildPageMetadata({
    view: 'meta',
    format,
    query,
    sort,
    title: `${name} Metagame`,
    description: `Presence, win rates and the matchup matrix for the ${name} metagame.`,
  })
}

export default async function MetaOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}) {
  const { format } = await params
  // `all` exists only for the tournaments views.
  if (isAllFormats(format)) notFound()
  const sp = await searchParams

  let query = parseMetaQuery(format, sp)
  const sort = parseSort(sp)
  const matrixTopN = parseMatrixTopN(sp)

  const ds = getDataSource()
  const [formats, report0, archetypes]: [
    FormatDTO[],
    MetaReportDTO,
    ArchetypeRef[],
  ] = await Promise.all([
    ds.listFormats(),
    ds.getMetaReport(query),
    ds.searchArchetypes(query.format, ''),
  ])

  // The default landing (last 30 days on the live clock) can hit a window with
  // no data (a format with no recent events, or fixtures that only seed whole
  // months). Rather than blank, fall back to the latest populated window so the
  // primary landing always shows the field (§9). Explicit non-default windows
  // still surface the EmptyState below.
  let report = report0
  const def = defaultWindow()
  if (
    report.kpis.matches === 0 &&
    query.start === def.start &&
    query.end === def.end
  ) {
    const latest = await ds.getLatestWindow(query.format)
    if (latest && (latest.start !== query.start || latest.end !== query.end)) {
      query = { ...query, start: latest.start, end: latest.end }
      report = await ds.getMetaReport(query)
    }
  }

  const fmtName = formatName(formats, format)
  const win = windowLabel(query.start, query.end)
  const canonicalHref = buildHref(query.format, query, { sort })

  // ---- Empty window → shared chrome + EmptyState (§5) ----------------------
  // Distinguish a genuinely empty window (no tournaments/matches) from a
  // populated window where the current filters simply excluded every archetype.
  if (report.kpis.matches === 0 || report.kpis.tournaments === 0) {
    return (
      <>
        <Suspense fallback={null}>
          <LensBar formats={formats} archetypes={archetypes} />
        </Suspense>
        <EmptyState
          title="No tournaments in this window"
          message={`We have no ${fmtName} results for ${win}. Widen the window to see the field.`}
          widenHref={buildHref(
            query.format,
            { ...query, ...expandPreset('last-3m') },
            { sort }
          )}
          widenLabel="Show the last 3 months"
        />
      </>
    )
  }
  if (report.rows.length === 0) {
    return (
      <>
        <Suspense fallback={null}>
          <LensBar formats={formats} archetypes={archetypes} />
        </Suspense>
        <EmptyState
          title="No archetypes clear the current filters"
          message={`${fmtName} has results for ${win}, but no archetype reaches the ${query.minMatches}-match floor. Lower the floor to see the field.`}
          widenHref={buildHref(
            query.format,
            { ...query, minMatches: 0 },
            { sort }
          )}
          widenLabel="Lower the floor"
        />
      </>
    )
  }

  // ---- Ledger headline: the leader and the best record as facts with their
  // intervals. No "edge" claim is made; the reader compares the intervals.
  const live = report.rows.filter(r => !r.isBucket)
  const byShare = [...live].sort((a, b) => b.share - a.share)
  const byWr = [...live].sort((a, b) => b.wr - a.wr)
  const mostPlayed: ArchetypeRowDTO | undefined = byShare[0]
  const topWr: ArchetypeRowDTO | undefined = byWr[0]
  const leaderIsTopWr =
    mostPlayed !== undefined && topWr?.slug === mostPlayed.slug
  const thinWindow =
    mostPlayed !== undefined && mostPlayed.wrHi - mostPlayed.wrLo >= WIDE_CI

  const top6 = byShare.slice(0, 6)

  // ---- Honest buckets + floor (principles 4/5): the landing hides unknown/
  // conflict and anything under the match floor; say so under the table and
  // link to the lens that reveals them. One extra read, memoized like the rest.
  const unfiltered: MetaReportDTO =
    query.hideBuckets || query.minMatches > 0
      ? await ds.getMetaReport({ ...query, hideBuckets: false, minMatches: 0 })
      : report
  const bucketShare = (key: 'unknown' | 'conflict') =>
    unfiltered.rows.find(
      r => r.isBucket && (r.slug === key || r.name.toLowerCase() === key)
    )?.share
  const unknownShare = bucketShare('unknown')
  const conflictShare = bucketShare('conflict')
  const hiddenBuckets =
    query.hideBuckets &&
    (unknownShare !== undefined || conflictShare !== undefined)
      ? { unknown: unknownShare, conflict: conflictShare }
      : null
  const showBucketsHref = hiddenBuckets
    ? buildHref(query.format, { ...query, hideBuckets: false }, { sort })
    : undefined
  const shownSlugs = new Set(report.rows.map(r => r.slug))
  const belowFloorCount = unfiltered.rows.filter(
    r => !r.isBucket && !shownSlugs.has(r.slug)
  ).length
  const belowFloor =
    query.minMatches > 0 && belowFloorCount > 0
      ? {
          count: belowFloorCount,
          href: buildHref(query.format, { ...query, minMatches: 0 }, { sort }),
        }
      : null

  return (
    <>
      <Suspense fallback={null}>
        <LensBar formats={formats} archetypes={archetypes} />
      </Suspense>

      {/* ---- HEADLINE + KPI ---- */}
      <div className="mt-10 grid items-end gap-9 md:grid-cols-[1.5fr_1fr]">
        <div>
          <p className="eyebrow mb-1.5">
            {fmtName} · {win}
          </p>
          <h1 className="font-display text-[clamp(30px,4.5vw,44px)] leading-[1.08] font-bold text-balance">
            {mostPlayed ? (
              <>
                {mostPlayed.name}
                <span className="text-ink-2 font-normal">
                  {' '}
                  is the most-played deck.
                </span>
              </>
            ) : (
              'The field is open.'
            )}
          </h1>
          {mostPlayed && (
            <dl className="text-ink-2 mt-4 grid max-w-[64ch] grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13.5px] max-[460px]:grid-cols-1 max-[460px]:gap-y-0.5">
              <LedgerRow label="Share">
                <b className="num text-ink">{pct1(mostPlayed.share)}</b> of all
                matches · <span className="num">{int(mostPlayed.matches)}</span>{' '}
                matches
              </LedgerRow>
              <LedgerRow
                label={
                  leaderIsTopWr ? 'Win rate · highest in field' : 'Win rate'
                }
              >
                <b className="num text-ink">{pct1(mostPlayed.wr)}</b> · 95% CI{' '}
                <span className="num">{ciRange(mostPlayed)}</span>
              </LedgerRow>
              {topWr && !leaderIsTopWr && (
                <LedgerRow label="Highest win rate">
                  <b className="text-ink">{topWr.name}</b> ·{' '}
                  <b className="num text-ink">{pct1(topWr.wr)}</b> · 95% CI{' '}
                  <span className="num">{ciRange(topWr)}</span> ·{' '}
                  <span className="num">{int(topWr.matches)}</span> matches
                </LedgerRow>
              )}
            </dl>
          )}
          {thinWindow && mostPlayed && (
            <LowSampleNotice matches={mostPlayed.matches} className="mt-3" />
          )}
        </div>
        <div className="grid grid-cols-3 gap-px border border-line bg-line">
          <KpiStat label="Tournaments" value={report.kpis.tournaments} />
          <KpiStat label="Deck entries" value={report.kpis.entries} />
          <KpiStat label="Matches" value={report.kpis.matches} />
        </div>
      </div>

      {/* ---- MATCHUP MATRIX — first after the headline (principle 3), inside
          the notched gold frame (§9 rule 4) ---- */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="eyebrow mb-1.5">Matchups</p>
            <h2 className="font-display text-[23px] font-bold">
              Matchup matrix
            </h2>
            <p className="text-ink-2 mt-0.5 max-w-[64ch] text-[13.5px]">
              Row beats column. Ink density is sample size: pale cells are thin
              samples; a dash means fewer than five matches.
            </p>
          </div>
          <Link
            href={buildHref(query.format, query, { path: '/matrix' })}
            className="border-gold-soft text-gold hover:bg-gold-wash inline-flex items-center border px-3 py-1.5 text-[13px] whitespace-nowrap"
          >
            Full matrix →
          </Link>
        </div>
        <div
          className="clip-notch-lg mt-4 p-px"
          style={{
            background:
              'linear-gradient(160deg, var(--gold-soft), var(--line-strong) 40%, var(--gold-soft))',
          }}
        >
          <div className="clip-notch-lg bg-surface p-5">
            {/* Same `matrix:` seam inside the streamed boundary; the skeleton
                mirrors it so the resolve shifts nothing (R6). */}
            <Suspense fallback={<MatrixSkeleton n={matrixTopN} />}>
              <MatchupMatrixHero query={query} n={matrixTopN} sp={sp} />
            </Suspense>
          </div>
        </div>
      </section>

      {/* ---- TOP OF THE FIELD — compact DeckTile strip ---- */}
      <section className="mt-14">
        <p className="eyebrow mb-1.5">Most played</p>
        <h2 className="font-display text-[23px] font-bold">Top of the field</h2>
        <p className="text-ink-2 mt-0.5 text-[13.5px]">
          The six most-played archetypes of the window. Art is each deck&rsquo;s
          signature card.
        </p>
        <div className="mt-[18px] grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr))]">
          {top6.map(row => (
            <DeckTile
              key={row.slug}
              row={row}
              rank={row.presenceRank}
              variant="compact"
              href={buildHref(query.format, query, {
                path: `/archetype/${row.slug}`,
              })}
            />
          ))}
        </div>
      </section>

      {/* ---- THE FIELD, RANKED — MetaTable ---- */}
      <section className="mt-14">
        <p className="eyebrow mb-1.5">Ranking</p>
        <h2 className="font-display text-[23px] font-bold">
          The field, ranked
        </h2>
        <p className="text-ink-2 mt-0.5 text-[13.5px]">
          Match-weighted share of the metagame. Win rate carries a 95%
          confidence interval, clustered by player.
        </p>
        <div className="mt-4">
          <MetaTable
            rows={report.rows}
            other={report.other}
            format={query.format}
            query={query}
            sort={sort}
            hiddenBuckets={hiddenBuckets}
            showBucketsHref={showBucketsHref}
            belowFloor={belowFloor}
          />
        </div>
      </section>

      {/* ---- WIN RATE vs PRESENCE — scatter panel ---- */}
      <section className="mt-14">
        <p className="eyebrow mb-1.5">Position</p>
        <h2 className="font-display text-[23px] font-bold">
          Win rate vs presence
        </h2>
        <p className="mt-0.5 text-[13.5px] text-ink-2">
          Every archetype above the sample floor. Right of the pack is popular;
          above the line is winning. Color marks the side of 50% the record
          supports.
        </p>
        <div className="mt-4 border border-line bg-surface shadow-ledger">
          <WrPresenceScatter
            rows={report.rows}
            rowHref={buildArchetypeHrefs(query.format, query, report.rows)}
          />
        </div>
      </section>

      <LedgerFooter
        sourceLine={`Source: MTGO Top32 & Melee · ${query.start} → ${query.end}`}
        canonical={canonicalHref}
      />
    </>
  )
}

// The matrix hero fetches its own grid; kept a server component (no client
// boundary), so the landing streams the rest before the grid resolves. Both
// variants (grid/list) render from the one MatrixDTO in this single server
// pass; the `matrix:` media variant picks per viewport (KTD3, R3, R6).
async function MatchupMatrixHero({
  query,
  n,
  sp,
}: {
  query: MetaQuery
  n: number
  sp: Record<string, string | string[] | undefined>
}) {
  const ds = getDataSource()
  const matrix: MatrixDTO = await ds.getMatchupMatrix({
    ...query,
    matrixTopN: n,
  })
  if (matrix.order.length === 0) {
    return (
      <p className="py-8 text-center text-[13.5px] text-ink-3">
        Not enough matchup data in this window to build the grid.
      </p>
    )
  }
  const picked = selectRowCells(matrix, parseRow(sp, matrix.order))
  const rowHref: Record<string, string> = Object.fromEntries(
    matrix.order.map(o => [
      String(o.slug),
      buildHref(query.format, query, { path: `/archetype/${o.slug}` }),
    ])
  )
  return (
    <>
      {/* grid — desktop seam (KTD3) */}
      <div className="hidden matrix:block">
        <MatchupMatrix data={matrix} rowHref={rowHref} />
      </div>
      {/* list — everywhere else; `?row` selection, rank-1 default (R4) */}
      <div className="matrix:hidden">
        <MatrixRowPicker order={matrix.order}>
          <MatchupList cells={picked.cells} sort="wrAsc" ranks={picked.ranks} />
        </MatrixRowPicker>
      </div>
    </>
  )
}

// One line of the headline ledger: a small tracked label, then the figures.
function LedgerRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  // dt/dd are direct grid children of the <dl>, so every label shares one
  // max-content column and none of them wrap.
  return (
    <>
      <dt className="text-ink-3 text-[11px] leading-[1.9] tracking-[0.12em] whitespace-nowrap uppercase max-[460px]:mt-1.5">
        {label}
      </dt>
      <dd className="leading-[1.55]">{children}</dd>
    </>
  )
}

function LedgerFooter({
  sourceLine,
  canonical,
}: {
  sourceLine: string
  canonical: string
}) {
  return (
    <footer className="mt-[72px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[18px] text-[12.5px] text-ink-3">
      <span>{sourceLine}</span>
      <span>Card art © Wizards of the Coast, via Scryfall</span>
      <span>
        Every view is a URL — this page is{' '}
        <span className="data">{canonical}</span>
      </span>
    </footer>
  )
}
