import type { Metadata } from 'next'

import { getDataSource } from '@/datasource'
import type {
  ArchetypeRef,
  ArchetypeRowDTO,
  FormatDTO,
  MatrixDTO,
  MetaQuery,
  MetaReportDTO,
} from '@/datasource/types'
import {
  buildHref,
  defaultWindow,
  parseMetaQuery,
  parseMatrixTopN,
  parseSort,
} from '@/lib/params'
import { buildPageMetadata } from '@/lib/seo'

import { LensBar } from '@/components/LensBar/LensBar'
import { DeckTile } from '@/components/DeckTile'
import { KpiStat } from '@/components/KpiStat'
import { EmptyState } from '@/components/EmptyState'
import { MetaTable } from '@/components/tables/MetaTable'
import { WrPresenceScatter } from '@/components/charts/WrPresenceScatter'
import { MatchupMatrix } from '@/components/charts/MatchupMatrix'

// ---------------------------------------------------------------------------
// Meta overview landing (WP5). All RSC: parse the lens once, resolve the data
// source, compose per the SPIKE order —
//   LensBar → editorial headline + KPI grid → 'Top of the field' DeckTile grid
//   → MetaTable panel → scatter panel → matrix hero (notched gold frame)
//   → footer.
// Empty window → LensBar + EmptyState (§5).
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
    description: `Presence, win rates, tiers and the matchup matrix for the ${name} metagame.`,
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

  // Default landing on the live-clock month can hit a window with no data (e.g.
  // the 1st of a month before ingest, or a format not yet seeded past last
  // month). Rather than blank, fall back to the latest populated window so the
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
        <LensBar formats={formats} archetypes={archetypes} />
        <EmptyState
          title="No tournaments in this window"
          message={`We have no ${fmtName} results for ${win}. Widen the window or clear the filters to see the field.`}
        />
      </>
    )
  }
  if (report.rows.length === 0) {
    return (
      <>
        <LensBar formats={formats} archetypes={archetypes} />
        <EmptyState
          title="No archetypes clear the current filters"
          message={`${fmtName} has results for ${win}, but nothing clears your current filters. Lower the match floor (min) or clear the filters to see the field.`}
        />
      </>
    )
  }

  // ---- Editorial headline, derived from the window's data (§9 rule 7) ------
  const live = report.rows.filter(r => !r.isBucket)
  const byShare = [...live].sort((a, b) => b.share - a.share)
  const byWr = [...live].sort((a, b) => b.wr - a.wr)
  const mostPlayed: ArchetypeRowDTO | undefined = byShare[0]
  const bestPerforming: ArchetypeRowDTO | undefined = byWr.find(
    r => r.slug !== mostPlayed?.slug
  )
  const runnerUp: ArchetypeRowDTO | undefined = byWr.find(
    r => r.slug !== mostPlayed?.slug && r.slug !== bestPerforming?.slug
  )

  const top6 = byShare.slice(0, 6)

  const perfLine =
    bestPerforming && mostPlayed && bestPerforming.wr > mostPlayed.wr
      ? 'The performance edge lies elsewhere.'
      : 'And winning the room too.'

  return (
    <>
      <LensBar formats={formats} archetypes={archetypes} />

      {/* ---- HEADLINE + KPI ---- */}
      <div className="mt-10 grid items-end gap-9 md:grid-cols-[1.5fr_1fr]">
        <div>
          <p className="eyebrow mb-1.5">
            The Ledger · {fmtName} · {win}
          </p>
          <h1 className="font-display text-[clamp(30px,4.5vw,44px)] leading-[1.08] font-bold text-balance">
            {mostPlayed
              ? `${mostPlayed.name} holds the room.`
              : 'The field is open.'}
            <br />
            <span className="font-normal text-ink-2">{perfLine}</span>
          </h1>
          {mostPlayed && (
            <p className="mt-3.5 max-w-[58ch] text-[15.5px] text-ink-2">
              <b className="text-ink">{mostPlayed.name}</b> is the most-played
              deck at <b className="text-ink">{pct1(mostPlayed.share)}</b> of
              all matches — winning{' '}
              <b className="text-ink">{pct1(mostPlayed.wr)}</b> of them.
              {bestPerforming && (
                <>
                  {' '}
                  The performance edge sits with{' '}
                  <b className="text-ink">{bestPerforming.name}</b> (
                  {pct1(bestPerforming.wr)})
                  {runnerUp && (
                    <>
                      {' '}
                      and <b className="text-ink">{runnerUp.name}</b> (
                      {pct1(runnerUp.wr)})
                    </>
                  )}
                  .
                </>
              )}
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-px border border-line bg-line">
          <KpiStat label="Tournaments" value={report.kpis.tournaments} />
          <KpiStat label="Decks" value={report.kpis.entries} />
          <KpiStat label="Matches" value={report.kpis.matches} />
        </div>
      </div>

      {/* ---- TOP OF THE FIELD — DeckTile grid ---- */}
      <section className="mt-14">
        <p className="eyebrow mb-1.5">The decks to beat</p>
        <h2 className="font-display text-[23px] font-bold">Top of the field</h2>
        <p className="mt-0.5 text-[13.5px] text-ink-2">
          The six most-played archetypes of the window. Art follows each
          deck&rsquo;s signature card.
        </p>
        <div className="mt-[18px] grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {top6.map((row, i) => (
            <DeckTile
              key={row.slug}
              row={row}
              rank={row.presenceRank}
              priority={i < 3}
              href={buildHref(query.format, query, {
                path: `/archetype/${row.slug}`,
              })}
            />
          ))}
        </div>
      </section>

      {/* ---- THE FIELD, RANKED — MetaTable ---- */}
      <section className="mt-14">
        <p className="eyebrow mb-1.5">Presence &amp; performance</p>
        <h2 className="font-display text-[23px] font-bold">
          The field, ranked
        </h2>
        <p className="mt-0.5 text-[13.5px] text-ink-2">
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
          <WrPresenceScatter rows={report.rows} />
        </div>
      </section>

      {/* ---- MATCHUP MATRIX — hero inside the notched gold frame (§9 rule 4) ---- */}
      <section className="mt-14">
        <p className="eyebrow mb-1.5">The moat</p>
        <h2 className="font-display text-[23px] font-bold">Matchup matrix</h2>
        <p className="mt-0.5 text-[13.5px] text-ink-2">
          Row beats column. Ink density is confidence — pale cells are small
          samples; a dash means fewer than five matches. Nobody else publishes
          this.
        </p>
        <div
          className="clip-notch-lg mt-4 p-px"
          style={{
            background:
              'linear-gradient(160deg, var(--gold-soft), var(--line-strong) 40%, var(--gold-soft))',
          }}
        >
          <div className="clip-notch-lg bg-surface p-5">
            <MatchupMatrixHero query={query} n={matrixTopN} />
          </div>
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
// boundary), so the landing streams the rest before the grid resolves.
async function MatchupMatrixHero({
  query,
  n,
}: {
  query: MetaQuery
  n: number
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
  const rowHref: Record<string, string> = Object.fromEntries(
    matrix.order.map(o => [
      String(o.slug),
      buildHref(query.format, query, { path: `/archetype/${o.slug}` }),
    ])
  )
  return <MatchupMatrix data={matrix} rowHref={rowHref} />
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
