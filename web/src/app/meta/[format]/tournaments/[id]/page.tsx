import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getDataSource } from '@/datasource'
import { isAllFormats } from '@/datasource/format-order'
import type {
  FormatDTO,
  MatrixDTO,
  MetaQuery,
  StandingDTO,
  TournamentDetailDTO,
  TournamentDTO,
} from '@/datasource/types'
import {
  archetypeHref,
  eventStats,
  isEventId,
  isPartialRecordSource,
  leaderLabel,
  placingLabel,
  rankStandings,
  recordLabel,
  SOURCE_LABEL,
  STANDINGS_PAGE_SIZE,
  standingLink,
  type EventFieldRow,
  type RankedStanding,
  type StandingLink,
} from '@/lib/events'
import { int } from '@/lib/format'
import { slicePage } from '@/lib/paging'
import { buildHref, parseMetaQuery, parsePage, parseRow } from '@/lib/params'
import { longDate } from '@/lib/dates'
import { buildPageMetadata } from '@/lib/seo'
import { cn } from '@/lib/utils'

import { KpiStat } from '@/components/KpiStat'
import { ManaPips } from '@/components/ManaPips'
import { Pager } from '@/components/Pager'
import { MatchupSurface } from '@/components/charts/MatchupSurface'
import { PresenceBars } from '@/components/charts/PresenceBars'

// ---------------------------------------------------------------------------
// Event page — one tournament's standings, field and matchups (RSC).
//
// `/meta/{format}/tournaments/{id}` where {format} is the event's own format
// or `all` (reached from the cross-format list); any other format redirects
// to the event's. The event itself is window-free; the lens params ride along
// only so "back" and the archetype links keep the user's window.
//
// Standings carry an explicit place on every row (published, or derived from
// the record when the source publishes none) and page through `?page` in
// 50-row slices, so a 1,500-player Regional Championship is one screen, not
// sixty. Deck names link to the archetype page's Decklists tab with
// `?deck=<entry>` selected. Players are plain text (no player pages yet).
// ---------------------------------------------------------------------------

type RouteParams = { format: string; id: string }
type SearchParams = Record<string, string | string[] | undefined>

const STANDINGS_ID = 'standings'

function formatLabel(formats: FormatDTO[], slug: string): string {
  return formats.find(f => f.slug === slug)?.name ?? slug
}

export const revalidate = 3600

async function loadEvent(id: string): Promise<TournamentDetailDTO | null> {
  if (!isEventId(id)) return null
  return getDataSource().getTournament(id)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await loadEvent(id)
  if (!detail) return { title: 'Tournament not found' }
  const t = detail.tournament
  const formats = await getDataSource().listFormats()
  // The event is window-free: canonical and OG use the default lens, so every
  // window that links here shares one canonical URL.
  return buildPageMetadata({
    view: 'meta',
    format: t.format,
    query: parseMetaQuery(t.format, {}),
    path: `/tournaments/${t.id}`,
    title: `${t.name} — ${longDate(t.date)}`,
    description: `${formatLabel(formats, t.format)} standings, field and matchups for ${t.name} (${t.entries} players).`,
  })
}

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}) {
  const { format, id } = await params
  const sp = await searchParams

  const detail = await loadEvent(id)
  if (!detail) notFound()
  const t = detail.tournament

  const query = parseMetaQuery(format, sp)
  if (!isAllFormats(format) && format !== t.format) {
    // 307, not 308: browsers cache a 308, and an event's format can still be
    // corrected by a later ingest.
    redirect(
      buildHref(
        t.format,
        { ...query, format: t.format },
        { path: `/tournaments/${t.id}` }
      )
    )
  }

  const formats = await getDataSource().listFormats()
  const formatName = formatLabel(formats, t.format)

  return (
    <>
      <nav className="mt-6 text-[12.5px]" aria-label="Breadcrumb">
        <Link
          href={buildHref(format, query, { path: '/tournaments' })}
          className="text-ink-3 no-underline hover:text-gold hover:underline hover:underline-offset-[3px]"
        >
          ← {isAllFormats(format) ? 'All' : formatName} tournaments
        </Link>
      </nav>

      <EventHeader tournament={t} formatName={formatName} />

      {detail.standings.length === 0 ? (
        <p className="mt-8 border border-line bg-surface p-6 text-[13.5px] text-ink-2">
          No standings were published for this event.
        </p>
      ) : (
        <EventBody
          detail={detail}
          routeFormat={format}
          // Archetype links always target the event's real format.
          query={{ ...query, format: t.format }}
          page={parsePage(sp)}
          sp={sp}
        />
      )}

      <EventFooter tournament={t} />
    </>
  )
}

function EventFooter({ tournament: t }: { tournament: TournamentDTO }) {
  return (
    <footer className="mt-[72px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[18px] text-[12.5px] text-ink-3">
      <span>
        Source: {SOURCE_LABEL[t.source]} · {longDate(t.date)}
      </span>
    </footer>
  )
}

/** KPIs, standings, field and matrix of an event with standings. */
function EventBody({
  detail,
  routeFormat,
  query,
  page,
  sp,
}: {
  detail: TournamentDetailDTO
  /** The `{format}` path segment the page was reached at (`all` included),
   *  so page links stay on the URL the reader is on. */
  routeFormat: string
  query: MetaQuery
  page: number
  sp: SearchParams
}) {
  const t = detail.tournament
  const ranked = rankStandings(detail.standings)
  const standings = ranked.map(r => r.standing)
  const { field, matrix } = eventStats(standings, detail.matchups, t.date)
  const hrefFor = (slug: string) => archetypeHref(t.format, query, slug, t.date)

  const slice = slicePage(ranked, page, STANDINGS_PAGE_SIZE)
  const row = parseRow(sp, matrix.order)
  // `row` rides so paging keeps the mobile matchup list's selection (KTD4).
  const pageHref = (n: number) =>
    `${buildHref(routeFormat, query, {
      path: `/tournaments/${t.id}`,
      page: n,
      row,
      matrixOrder: matrix.order,
    })}#${STANDINGS_ID}`
  const hasPublished = ranked.some(r => !r.derived)
  const hasDerived = ranked.some(r => r.derived)
  const partialRecords = isPartialRecordSource(t.source)

  return (
    <>
      <EventKpis standings={standings} field={field} />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section
          id={STANDINGS_ID}
          aria-labelledby="standings-h"
          className="min-w-0 scroll-mt-6"
        >
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="standings-h" className="eyebrow">
              Standings
            </h2>
            {slice.pages > 1 && (
              <p className="text-[12.5px] text-ink-3">
                Players{' '}
                <span className="num text-ink-2">
                  {int(slice.from)}–{int(slice.to)}
                </span>{' '}
                of <span className="num text-ink-2">{int(slice.total)}</span>
              </p>
            )}
          </div>
          <StandingsTable
            rows={slice.visible}
            placeHeading={hasPublished ? 'Place' : 'Rank'}
            linkFor={s => standingLink(t.format, query, s, t.date)}
            archetypeHrefFor={hrefFor}
          />
          <StandingsNotes
            derived={hasDerived}
            published={hasPublished}
            partialRecords={partialRecords}
          />
          <Pager
            page={slice.page}
            pages={slice.pages}
            from={slice.from}
            to={slice.to}
            total={slice.total}
            unit="players"
            hrefFor={pageHref}
            className="mt-4"
          />
        </section>
        <FieldPanel field={field} hrefFor={hrefFor} />
      </div>
      <MatchupsSection matrix={matrix} row={row} hrefFor={hrefFor} />
    </>
  )
}

/** The one or two provenance lines under the table: how the places were
 *  arrived at, and whether the records are whole. */
function StandingsNotes({
  derived,
  published,
  partialRecords,
}: {
  derived: boolean
  published: boolean
  partialRecords: boolean
}) {
  if (!derived && !partialRecords) return null
  return (
    <div className="mt-2 grid gap-1 text-[12px] text-ink-3">
      {derived && (
        <p>
          {published
            ? 'Unranked entrants are placed by match points (3 per win, 1 per draw), then fewer losses; equal records share a place.'
            : 'The source publishes no final placings. Rank follows match points (3 per win, 1 per draw), then fewer losses; equal records share a rank.'}
        </p>
      )}
      {partialRecords && (
        <p>Records count only matches against other published decks.</p>
      )}
    </div>
  )
}

function EventHeader({
  tournament: t,
  formatName,
}: {
  tournament: TournamentDTO
  formatName: string
}) {
  return (
    <header className="mt-4">
      <p className="eyebrow mb-1.5">
        Event · {formatName} · {SOURCE_LABEL[t.source]}
      </p>
      <h1 className="font-display text-[clamp(24px,4vw,36px)] font-bold text-balance">
        {t.name}
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        <span className="data">{longDate(t.date)}</span> ·{' '}
        <span className="data">{int(t.entries)}</span> players
        {t.link && (
          <>
            {' '}
            ·{' '}
            <a
              href={t.link}
              target="_blank"
              rel="noreferrer"
              className="text-ink-2 hover:text-gold hover:underline hover:underline-offset-[3px]"
            >
              View on {SOURCE_LABEL[t.source]} ↗
            </a>
          </>
        )}
      </p>
    </header>
  )
}

function EventKpis({
  standings,
  field,
}: {
  standings: StandingDTO[]
  field: EventFieldRow[]
}) {
  const leader = standings[0]
  // Three joined tiles; on a phone the leader's name needs the full width,
  // so the triad folds to a 2 + 1 grid below 480px.
  return (
    <div className="mt-6 grid grid-cols-3 gap-px border border-line bg-line max-[480px]:grid-cols-2">
      <KpiStat label="Players" value={standings.length} />
      <KpiStat
        label="Archetypes"
        value={field.filter(f => !f.isBucket).length}
      />
      <KpiStat
        label={leaderLabel(leader.rank)}
        value={leader.archetype.name}
        className="max-[480px]:col-span-2 [&_.num]:truncate [&_.num]:text-[20px]"
      />
    </div>
  )
}

function FieldPanel({
  field,
  hrefFor,
}: {
  field: EventFieldRow[]
  hrefFor: (slug: string) => string
}) {
  const rowHref = Object.fromEntries(
    field.filter(f => !f.isBucket).map(f => [f.slug, hrefFor(f.slug)])
  )
  const counts = Object.fromEntries(field.map(f => [f.slug, f.decks]))
  return (
    <aside aria-labelledby="field-h" className="min-w-0">
      <div className="lg:sticky lg:top-6">
        <h2 id="field-h" className="eyebrow mb-2">
          The field
        </h2>
        <div className="border border-line bg-surface px-3.5 py-2 shadow-ledger">
          <PresenceBars
            rows={field}
            unit="decks"
            rowHref={rowHref}
            counts={counts}
            compact
          />
        </div>
      </div>
    </aside>
  )
}

function MatchupsSection({
  matrix,
  row,
  hrefFor,
}: {
  matrix: MatrixDTO
  /** `?row`, the phone list's selected archetype (rank 1 when absent). */
  row: string | undefined
  hrefFor: (slug: string) => string
}) {
  return (
    <section aria-labelledby="matchups-h" className="mt-10">
      <h2 id="matchups-h" className="eyebrow mb-1.5">
        Matchups
      </h2>
      <p className="mb-3 max-w-[65ch] text-[13px] text-ink-2">
        Win rate of the row archetype against the column, in this event only.
        One event is a small sample: the fainter the cell, the fewer the games
        behind it.
      </p>
      {matrix.order.length >= 2 ? (
        <div className="border border-line bg-surface p-3 shadow-ledger">
          {/* The same `matrix:` seam as the overview and matrix routes (§9
              Matrix Seam Rule): the N×N grid only on a wide, hover-capable
              screen; the per-archetype list with inline CIs elsewhere. */}
          <MatchupSurface matrix={matrix} row={row} hrefFor={hrefFor} />
        </div>
      ) : (
        <p className="border border-line bg-surface p-6 text-[13.5px] text-ink-2">
          Not enough recorded matches between archetypes for a matrix.
        </p>
      )}
    </section>
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
      scope="col"
      className={cn(
        'border-b border-line-strong px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-[0.13em] text-ink-3 uppercase',
        className
      )}
    >
      {children}
    </th>
  )
}

function StandingsTable({
  rows,
  placeHeading,
  linkFor,
  archetypeHrefFor,
}: {
  rows: RankedStanding[]
  placeHeading: 'Place' | 'Rank'
  linkFor: (s: StandingDTO) => StandingLink | null
  archetypeHrefFor: (slug: string) => string
}) {
  return (
    <div className="overflow-x-auto border border-line bg-surface shadow-ledger">
      <table
        aria-label="Final standings"
        className="w-full border-collapse text-[13.5px]"
      >
        <thead>
          <tr>
            <Th className="w-[64px]">{placeHeading}</Th>
            <Th>Deck</Th>
            {/* Below `md` the pilot folds under the deck name so the record
                stays on screen without a sideways scroll. */}
            <Th className="hidden md:table-cell">Pilot</Th>
            <Th className="text-right">Record</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <StandingRow
              key={r.standing.entryId}
              ranked={r}
              link={linkFor(r.standing)}
              archetypeHref={
                r.standing.archetype.isBucket
                  ? null
                  : archetypeHrefFor(r.standing.archetype.slug)
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Stretches a link over its (relative) row so the whole row is one target,
 *  without nesting interactive elements or a client click handler. */
const ROW_LINK_CLASS =
  "font-semibold text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:text-gold group-hover:text-gold group-hover:underline group-hover:underline-offset-[3px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-gold"

function StandingRow({
  ranked: { standing: s, place, derived },
  link,
  archetypeHref,
}: {
  ranked: RankedStanding
  link: StandingLink | null
  /** Fallback name link when the row has no decklist to open. */
  archetypeHref: string | null
}) {
  return (
    <tr
      className={cn(
        'hover:bg-[var(--gold-wash)]',
        link && 'group relative cursor-pointer',
        s.archetype.isBucket && 'text-ink-2'
      )}
    >
      <td className="border-b border-line px-3.5 py-2 align-top md:align-middle">
        <span
          className={cn(
            'data whitespace-nowrap',
            // The published winner is bold ink: weight carries it, and gold
            // never encodes a value (§9 rule 1). A derived first place is a
            // record, not a title, so it stays in the secondary ink.
            place === 1 && !derived ? 'font-bold text-ink' : 'text-ink-2'
          )}
        >
          {placingLabel(place)}
        </span>
      </td>
      <td className="border-b border-line px-3.5 py-2 align-top md:align-middle">
        <span className="inline-flex items-center gap-2">
          <ManaPips colors={s.archetype.color} size={14} />
          <DeckName standing={s} link={link} archetypeHref={archetypeHref} />
          <ListHint standing={s} link={link} />
        </span>
        <span className="mt-0.5 block text-[12.5px] text-ink-2 md:hidden">
          {s.player}
        </span>
      </td>
      <td className="hidden border-b border-line px-3.5 py-2 text-ink-2 md:table-cell">
        {s.player}
      </td>
      <td className="border-b border-line px-3.5 py-2 text-right align-top md:align-middle">
        <span className="data">{recordLabel(s)}</span>
      </td>
    </tr>
  )
}

/** Flags a row whose click leaves for the source site, or that has no list
 *  anywhere. Keyed on the link, so a bucket row with stored cards still says
 *  it opens the source. */
function ListHint({
  standing: s,
  link,
}: {
  standing: StandingDTO
  link: StandingLink | null
}) {
  const hint = link?.external
    ? 'source list ↗'
    : !s.hasDecklist
      ? 'no list'
      : null
  return hint ? (
    <span className="text-[11px] whitespace-nowrap text-ink-3">{hint}</span>
  ) : null
}

/** The row's one link: the decklist (stretched over the row), else the
 *  archetype page, else plain text. */
function DeckName({
  standing: s,
  link,
  archetypeHref,
}: {
  standing: StandingDTO
  link: StandingLink | null
  archetypeHref: string | null
}) {
  const label = `${s.archetype.name} decklist by ${s.player}`
  if (link?.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label} (opens the source)`}
        className={ROW_LINK_CLASS}
      >
        {s.archetype.name}
      </a>
    )
  }
  if (link) {
    return (
      <Link href={link.href} aria-label={label} className={ROW_LINK_CLASS}>
        {s.archetype.name}
      </Link>
    )
  }
  if (archetypeHref) {
    return (
      <Link
        href={archetypeHref}
        className="font-semibold text-ink no-underline hover:text-gold hover:underline hover:underline-offset-[3px]"
      >
        {s.archetype.name}
      </Link>
    )
  }
  return <span className="font-semibold">{s.archetype.name}</span>
}
