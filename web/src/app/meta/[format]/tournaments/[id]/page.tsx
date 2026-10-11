import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'

import { getDataSource } from '@/datasource'
import { isAllFormats } from '@/datasource/format-order'
import type {
  FormatDTO,
  MatrixDTO,
  StandingDTO,
  TournamentDetailDTO,
  TournamentDTO,
} from '@/datasource/types'
import {
  archetypeHref,
  eventStats,
  isEventId,
  leaderLabel,
  placingLabel,
  recordLabel,
  sortStandings,
  standingLink,
  type EventFieldRow,
  type StandingLink,
} from '@/lib/events'
import { buildHref, parseMetaQuery } from '@/lib/params'
import { buildPageMetadata } from '@/lib/seo'
import { cn } from '@/lib/utils'

import { KpiStat, KpiStatGroup } from '@/components/KpiStat'
import { ManaPips } from '@/components/ManaPips'
import { MatchupMatrix } from '@/components/charts/MatchupMatrix'
import { PresenceBars } from '@/components/charts/PresenceBars'

// ---------------------------------------------------------------------------
// Event page — one tournament's standings, field and matchups (RSC).
//
// `/meta/{format}/tournaments/{id}` where {format} is the event's own format
// or `all` (reached from the cross-format list); any other format redirects
// to the event's. The event itself is window-free; the lens params ride along
// only so "back" and the archetype links keep the user's window.
//
// Deck names link to the archetype page's Decklists tab with `?deck=<entry>`
// selected. Players are plain text (no player pages yet).
// ---------------------------------------------------------------------------

type RouteParams = { format: string; id: string }
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

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

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
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { id } = await params
  const sp = await searchParams
  const detail = await loadEvent(id)
  if (!detail) return { title: 'Tournament not found' }
  const t = detail.tournament
  const formats = await getDataSource().listFormats()
  const query = parseMetaQuery(t.format, sp)
  return buildPageMetadata({
    view: 'meta',
    format: t.format,
    query,
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
    permanentRedirect(
      buildHref(
        t.format,
        { ...query, format: t.format },
        { path: `/tournaments/${t.id}` }
      )
    )
  }

  const formats = await getDataSource().listFormats()
  const formatName = formatLabel(formats, t.format)
  // Archetype links always target the event's real format.
  const eventQuery = { ...query, format: t.format }
  const standings = sortStandings(detail.standings)
  const { field, matrix } = eventStats(standings, detail.matchups, t.date)
  const hrefFor = (slug: string) =>
    archetypeHref(t.format, eventQuery, slug, t.date)

  return (
    <>
      <nav className="mt-6 text-[12.5px]" aria-label="Breadcrumb">
        <Link
          href={buildHref(format, query, { path: '/tournaments' })}
          className="text-ink-3 no-underline hover:text-gold hover:underline hover:underline-offset-[3px]"
        >
          ←{' '}
          {isAllFormats(format)
            ? 'All tournaments'
            : `${formatName} tournaments`}
        </Link>
      </nav>

      <EventHeader tournament={t} formatName={formatName} />

      {standings.length === 0 ? (
        <p className="mt-8 border border-line bg-surface p-6 text-[13.5px] text-ink-2">
          No standings were published for this event.
        </p>
      ) : (
        <>
          <EventKpis standings={standings} field={field} />
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section aria-labelledby="standings-h" className="min-w-0">
              <h2 id="standings-h" className="eyebrow mb-2">
                Standings
              </h2>
              <StandingsTable
                standings={standings}
                showPlace={standings.some(s => s.rank !== null)}
                linkFor={s => standingLink(t.format, eventQuery, s, t.date)}
                archetypeHrefFor={hrefFor}
              />
              <p className="mt-2 text-[12px] text-ink-3">
                Records count only matches against other published decks.
              </p>
            </section>
            <FieldPanel field={field} hrefFor={hrefFor} />
          </div>
          <MatchupsSection matrix={matrix} hrefFor={hrefFor} />
        </>
      )}

      <footer className="mt-[72px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[18px] text-[12.5px] text-ink-3">
        <span>
          Source: {SOURCE_LABEL[t.source]} · {longDate(t.date)}
        </span>
      </footer>
    </>
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
      <h1 className="font-display text-[clamp(24px,4vw,36px)] font-bold">
        {t.name}
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        <span className="data">{longDate(t.date)}</span> ·{' '}
        <span className="data">{t.entries}</span> players
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
  return (
    <KpiStatGroup columns={3} className="mt-6">
      <KpiStat label="Players" value={standings.length} />
      <KpiStat
        label="Archetypes"
        value={field.filter(f => !f.isBucket).length}
      />
      <KpiStat
        label={leaderLabel(leader.rank)}
        value={leader.archetype.name}
        className="[&_.num]:truncate [&_.num]:text-[20px]"
      />
    </KpiStatGroup>
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
  hrefFor,
}: {
  matrix: MatrixDTO
  hrefFor: (slug: string) => string
}) {
  const rowHref = Object.fromEntries(
    matrix.order.map(o => [o.slug, hrefFor(o.slug)])
  )
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
          <MatchupMatrix data={matrix} rowHref={rowHref} />
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
  standings,
  showPlace,
  linkFor,
  archetypeHrefFor,
}: {
  standings: StandingDTO[]
  showPlace: boolean
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
            {showPlace && <Th className="w-[64px]">Place</Th>}
            <Th>Deck</Th>
            <Th>Pilot</Th>
            <Th className="text-right">Record</Th>
          </tr>
        </thead>
        <tbody>
          {standings.map(s => (
            <StandingRow
              key={s.entryId}
              standing={s}
              showPlace={showPlace}
              link={linkFor(s)}
              archetypeHref={
                s.archetype.isBucket ? null : archetypeHrefFor(s.archetype.slug)
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
  standing: s,
  showPlace,
  link,
  archetypeHref,
}: {
  standing: StandingDTO
  showPlace: boolean
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
      {showPlace && (
        <td className="border-b border-line px-3.5 py-2">
          <span
            className={cn(
              'data',
              s.rank === 1 ? 'font-bold text-gold' : 'text-ink-2'
            )}
          >
            {placingLabel(s.rank) ?? '—'}
          </span>
        </td>
      )}
      <td className="border-b border-line px-3.5 py-2">
        <span className="inline-flex items-center gap-2">
          <ManaPips colors={s.archetype.color} size={14} />
          <DeckName standing={s} link={link} archetypeHref={archetypeHref} />
          {!s.hasDecklist && (
            <span className="text-[11px] text-ink-3">
              {link ? 'source list ↗' : 'no list'}
            </span>
          )}
        </span>
      </td>
      <td className="border-b border-line px-3.5 py-2 text-ink-2">
        {s.player}
      </td>
      <td className="border-b border-line px-3.5 py-2 text-right">
        <span className="data">{recordLabel(s)}</span>
      </td>
    </tr>
  )
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
