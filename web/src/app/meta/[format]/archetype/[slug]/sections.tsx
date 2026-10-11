import type { ReactNode } from 'react'
import Link from 'next/link'

import type {
  ArchetypeDetailDTO,
  ArchetypeRowDTO,
  CardAdoptionDTO,
  MetaChangeDTO,
  MetaQuery,
} from '@/datasource/types'
import type { DeckSelection } from '@/lib/deck-selection'
import { recordFootnote, sliceRecentDecks } from '@/lib/decks'
import { buildHref } from '@/lib/params'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { LedgerRow, LEDGER_DL_CLASS } from '@/components/LedgerRow'
import { LowSampleNotice } from '@/components/LowSampleNotice'
import { ManaPips } from '@/components/ManaPips'
import {
  DeckDim,
  DeckNavProvider,
  DeckLink,
  OtherDecksControl,
} from '@/components/decklist/DeckNav'
import { DecklistView } from '@/components/decklist/DecklistView'
import { RecentDecks } from '@/components/decklist/RecentDecks'
import { CardAdoptionTable } from '@/components/tables/CardAdoptionTable'
import { MatchupList } from '@/components/tables/MatchupList'
import { TrendChart } from '@/components/charts/TrendChart'
import { WrCiChart } from '@/components/charts/WrCiChart'

// ---------------------------------------------------------------------------
// The archetype detail page's sections (WP5 + U7), split out of page.tsx so
// the page stays a thin data → layout function. All server components; the
// client islands (Radix tabs/collapsible, DeckNav) are imported as before.
// ---------------------------------------------------------------------------

export const TABS = ['decklists', 'matchups', 'trends', 'performance'] as const
export type TabKey = (typeof TABS)[number]

type SearchParams = Record<string, string | string[] | undefined>

export function readTab(sp: SearchParams): TabKey {
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

type Selection = Extract<DeckSelection, { kind: 'ok' }>

// ---- Header ----

// A 95% interval ten points wide or more is the honest signal of a thin
// window: hedge the headline rather than hide it (same floor as the overview).
const WIDE_CI = 0.1

const int = (n: number) => n.toLocaleString('en-US')

export function ArchetypeHeader({
  fmtName,
  window,
  name,
  color,
  summary,
}: {
  fmtName: string
  /** The lens window as the eyebrow prints it (`windowLabel`). */
  window: string
  name: string
  color: string | null
  /** Null in the deck-only view (no window data for the archetype). */
  summary: ArchetypeRowDTO | null
}) {
  const tier = summary ? tierLabel(summary.tier) : null
  const thin = summary !== null && summary.wrHi - summary.wrLo >= WIDE_CI
  return (
    <header className="mt-10">
      <p className="eyebrow mb-1.5">
        {fmtName} · {window}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <ManaPips colors={color} size={17} />
        <h1 className="font-display text-[clamp(26px,4vw,38px)] font-bold">
          {name}
        </h1>
        {tier && (
          <span
            className="inline-block border border-gold-soft px-2 py-0.5 text-[11px] font-bold tracking-[0.08em] text-gold"
            title="Tier band from the win rate's lower bound"
          >
            {tier}
          </span>
        )}
      </div>
      {summary ? (
        <>
          {/* The headline ledger (§9): win rate with its interval, share with
              its rank, and the record, each a labelled row. */}
          <dl className={LEDGER_DL_CLASS}>
            <LedgerRow label="Win rate">
              <b className="num text-ink">{pct1(summary.wr)}</b> · 95% CI{' '}
              <span className="num">
                {(summary.wrLo * 100).toFixed(1)}–{pct1(summary.wrHi)}
              </span>{' '}
              · <span className="num">{int(summary.matches)}</span> matches
            </LedgerRow>
            <LedgerRow label="Share">
              <b className="num text-ink">{pct1(summary.share)}</b> of all
              matches · rank{' '}
              <span className="num">#{summary.presenceRank}</span> ·{' '}
              <span className="num">{int(summary.decks)}</span> deck entries
            </LedgerRow>
            <LedgerRow label="Record">
              <span className="num text-ink">
                {summary.wins}–{summary.losses}
                {summary.draws > 0 ? `–${summary.draws}` : ''}
              </span>{' '}
              · <span className="num">{int(summary.players)}</span> players
            </LedgerRow>
          </dl>
          {thin && (
            <LowSampleNotice matches={summary.matches} className="mt-3" />
          )}
        </>
      ) : (
        <p className="mt-2 text-[13.5px] text-ink-2">
          No matches in the current window.
        </p>
      )}
    </header>
  )
}

// ---- Tabs ----

const TAB_LABELS: Record<TabKey, string> = {
  decklists: 'Decklists',
  matchups: 'Matchups',
  trends: 'Trends',
  performance: 'Performance',
}

/** The eyebrow → H2 → one-line description every tab panel opens with (§9
 *  Titled Section Rule: density is permitted, untitled density is not). */
function TabHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="mb-4">
      <p className="eyebrow mb-1.5">{eyebrow}</p>
      <h2 className="font-display text-[23px] font-bold">{title}</h2>
      <p className="mt-0.5 max-w-[64ch] text-[13.5px] text-ink-2">{children}</p>
    </div>
  )
}

export function ArchetypeTabs({
  tab,
  tabHref,
  detail,
  changes,
  fmtName,
  decklists,
}: {
  tab: TabKey
  tabHref: (t: TabKey) => string
  detail: ArchetypeDetailDTO
  /** The format's bans and set releases, drawn on the trend chart. */
  changes: MetaChangeDTO[]
  fmtName: string
  decklists: ReactNode
}) {
  const name = detail.archetype.name
  // Order by match volume — the user asked for "matchups sorted by number of
  // matches"; wr falls back as the tiebreak for equal-volume pairs.
  const nonMirror = detail.matchups
    .filter(m => !m.isMirror)
    .sort((a, b) => b.games - a.games || b.wr - a.wr)
  const weeks = detail.trends.length
  return (
    <Tabs defaultValue={tab} className="mt-8">
      <TabsList aria-label={`${name} views`}>
        {TABS.map(t => (
          // asChild → the trigger IS the link, so switching tabs rewrites the
          // URL (?tab) and the RSC re-renders with the new active panel (§2).
          <TabsTrigger key={t} value={t} asChild>
            <Link href={tabHref(t)}>{TAB_LABELS[t]}</Link>
          </TabsTrigger>
        ))}
      </TabsList>

      {/* DECKLISTS — featured deck (2/3) + recent-decks column (1/3, R16) */}
      <TabsContent value="decklists" className="mt-6">
        {decklists}
      </TabsContent>

      {/* MATCHUPS — this row vs all (shared MatchupList, games-ordered) */}
      <TabsContent value="matchups" className="mt-6">
        <TabHeading eyebrow="Matchups" title={`${name} against the field`}>
          Win rate against each opponent in the window, most-played pairings
          first. The 95% interval sits under each figure; a dash means fewer
          than five matches.
        </TabHeading>
        <MatchupList cells={nonMirror} />
      </TabsContent>

      {/* TRENDS */}
      <TabsContent value="trends" className="mt-6">
        <TabHeading eyebrow="Trends" title="Presence and win rate by week">
          Weekly share of {fmtName} matches and win rate over the window
          {weeks > 0 ? ` (${weeks} week${weeks === 1 ? '' : 's'})` : ''}. A gap
          in the win-rate line is a week with no games.
        </TabHeading>
        <TrendChart trends={detail.trends} changes={changes} />
      </TabsContent>

      {/* PERFORMANCE */}
      <TabsContent value="performance" className="mt-6">
        <TabHeading eyebrow="Performance" title="Win rate with its interval">
          The point is the win rate; the bar is the 95% confidence interval,
          clustered by player. Colour marks the side of 50% the interval
          supports.
        </TabHeading>
        <div className="border border-line bg-surface px-4 py-3 shadow-ledger">
          <WrCiChart rows={[detail.summary]} />
        </div>
      </TabsContent>
    </Tabs>
  )
}

// ---- Decklists tab ----

export function DecklistsTab({
  selection,
  query,
  archPath,
  decksPage,
  shownDeckId,
}: {
  selection: Selection
  query: MetaQuery
  archPath: string
  decksPage: number
  /** The `?deck` id, only when it resolved to the shown deck. */
  shownDeckId: string | undefined
}) {
  const { detail, entries, featured, deck } = selection
  // KTD8: the page slices the cached list, so the RSC payload carries only
  // the rendered rows — no API route, no client fetching.
  const recentPage = sliceRecentDecks(entries.entries, entries.total, decksPage)
  const href = (opts: { deck?: string; decks?: number }) =>
    buildHref(query.format, query, {
      path: archPath,
      tab: 'decklists',
      ...opts,
    })
  // The recent-decks list renders once — inside the mobile "Other decks"
  // control (which keeps it visible on desktop) or, with no decks at all,
  // directly in the column. Rows keep the current ?decks page and set ?deck.
  const recentColumn = (
    <RecentDecks
      page={recentPage}
      featuredId={featured?.id ?? null}
      activeId={deck?.entry.id}
      deckHref={entryId => href({ deck: entryId, decks: decksPage })}
      olderHref={
        recentPage.hasMore
          ? href({ deck: shownDeckId, decks: decksPage + 1 })
          : null
      }
    />
  )
  const footnote = recordFootnote([
    ...(deck ? [deck.entry.event.source] : []),
    ...recentPage.visible.map(e => e.event.source),
  ])
  // "Back to featured" drops the selection, keeping the lens + decks page.
  const backToFeaturedHref =
    featured && deck && deck.entry.id !== featured.id
      ? href({ decks: decksPage })
      : null

  return (
    <DeckNavProvider>
      <div className="flex flex-col gap-6 md:grid md:grid-cols-3 md:gap-x-6">
        {/* Recent decks. On mobile they collapse into the "Other decks"
            control above the deck (R16); keyed on the shown deck id so a pick
            closes it (R17). On desktop the list shows directly. */}
        {/* On desktop the column pins and scrolls inside itself, so a
            50-row page never leaves the deck beside an empty gutter. */}
        {recentPage.visible.length > 0 ? (
          <aside className="order-1 min-w-0 md:sticky md:top-6 md:order-2 md:max-h-[calc(100vh-3rem)] md:self-start md:overflow-y-auto">
            <OtherDecksControl
              key={deck?.entry.id ?? 'featured'}
              count={recentPage.shown}
            >
              {recentColumn}
            </OtherDecksControl>
          </aside>
        ) : (
          <aside className="order-1 min-w-0 max-md:hidden md:order-2">
            {recentColumn}
          </aside>
        )}

        {/* The shown deck, dimmed while a swap pends (R17). */}
        <div className="order-2 min-w-0 md:order-1 md:col-span-2">
          <DeckDim>
            <DeckNotes selection={selection} />
            {backToFeaturedHref && (
              <p className="mb-4 text-[13px]">
                <DeckLink
                  href={backToFeaturedHref}
                  className="font-semibold text-gold hover:underline hover:underline-offset-[3px]"
                >
                  Back to featured
                </DeckLink>
              </p>
            )}
            {deck ? (
              <DecklistView
                deck={deck}
                featured={!!featured && deck.entry.id === featured.id}
              />
            ) : (
              <div className="border border-line bg-surface px-4 py-6 text-[13.5px] text-ink-3 shadow-ledger">
                No featured decklist — no decklists were published in the last
                14 days of play.
              </div>
            )}
          </DeckDim>
        </div>
      </div>

      {/* One provenance footnote per tab, only when an MTGO event is on
          screen: MTGO records are partial (matches vs unpublished decks are
          not stored). */}
      {footnote && <p className="mt-2 text-[12px] text-ink-3">{footnote}</p>}

      {/* Outside the deck grid on purpose: the sticky recent-decks column is
          bounded by its grid, so a breakdown inside it got painted over. */}
      {detail && (
        <CardBreakdown main={detail.mainCards} side={detail.sideCards} />
      )}
    </DeckNavProvider>
  )
}

const NOTE_CLASS =
  'mb-4 border border-line bg-surface px-4 py-3 text-[13px] text-ink-2 shadow-ledger'

/** R11 outside-window note, plus the KTD6 note when the deck now belongs to
 *  another archetype the page could not safely redirect to. */
function DeckNotes({ selection }: { selection: Selection }) {
  const { outsideWindow, reclassifiedTo } = selection
  return (
    <>
      {reclassifiedTo && (
        <p className={NOTE_CLASS}>
          This deck is now classified as{' '}
          <span className="font-semibold text-ink">{reclassifiedTo.name}</span>{' '}
          — showing it here anyway.
        </p>
      )}
      {outsideWindow && (
        <p className={NOTE_CLASS}>
          This deck is no longer in the current window — showing it anyway.
        </p>
      )}
    </>
  )
}

/** Card breakdown — the aggregate tables, collapsed by default and full
 *  width below the deck grid (R13/R16). */
function CardBreakdown({
  main,
  side,
}: {
  main: CardAdoptionDTO[]
  side: CardAdoptionDTO[]
}) {
  return (
    <Collapsible defaultOpen={false} className="mt-6 min-w-0">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold flex w-full items-center justify-between border border-line bg-surface px-4 py-3 text-[13px] font-semibold text-ink shadow-ledger hover:text-gold"
        >
          Card breakdown
          <span aria-hidden className="text-ink-3">
            <span className="group-data-[state=open]:hidden">+</span>
            <span className="hidden group-data-[state=open]:inline">−</span>
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="min-w-0">
            <h3 className="eyebrow mb-2">Maindeck</h3>
            <CardAdoptionTable cards={main} board="MAIN" />
          </div>
          <div className="min-w-0">
            <h3 className="eyebrow mb-2">Sideboard</h3>
            <CardAdoptionTable cards={side} board="SIDE" />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---- Footer ----

export function PageFooter({ href }: { href: string }) {
  return (
    <footer className="mt-[72px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[18px] text-[12.5px] text-ink-3">
      <span>Card art © Wizards of the Coast, via Scryfall</span>
      <span>
        Every view is a URL — this page is <span className="data">{href}</span>
      </span>
    </footer>
  )
}
