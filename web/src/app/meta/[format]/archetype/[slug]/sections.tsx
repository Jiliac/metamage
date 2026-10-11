import type { ReactNode } from 'react'
import Link from 'next/link'

import type {
  ArchetypeDetailDTO,
  ArchetypeRowDTO,
  CardAdoptionDTO,
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

export function ArchetypeHeader({
  format,
  name,
  color,
  summary,
}: {
  format: string
  name: string
  color: string | null
  /** Null in the deck-only view (no window data for the archetype). */
  summary: ArchetypeRowDTO | null
}) {
  const tier = summary ? tierLabel(summary.tier) : null
  return (
    <header className="mt-6">
      <p className="eyebrow mb-1.5">
        Archetype · {format[0]?.toUpperCase()}
        {format.slice(1)}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <ManaPips colors={color} size={17} />
        <h1 className="font-display text-[clamp(26px,4vw,38px)] font-bold">
          {name}
        </h1>
        {tier && (
          <span className="inline-block border border-gold-soft px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-gold">
            {tier}
          </span>
        )}
      </div>
      {summary ? (
        <p className="mt-2 text-[13.5px] text-ink-2">
          <span className="data text-ink">{pct1(summary.wr)}</span> win rate ·{' '}
          <span className="data">{`${summary.wins}-${summary.losses}-${summary.draws}`}</span>{' '}
          · <span className="data">{summary.matches}</span> matches ·{' '}
          <span className="data">{pct1(summary.share)}</span> of the meta
        </p>
      ) : (
        <p className="mt-2 text-[13.5px] text-ink-2">
          No matches in the current window.
        </p>
      )}
    </header>
  )
}

// ---- Tabs ----

export function ArchetypeTabs({
  tab,
  tabHref,
  detail,
  decklists,
}: {
  tab: TabKey
  tabHref: (t: TabKey) => string
  detail: ArchetypeDetailDTO
  decklists: ReactNode
}) {
  // Order by match volume — the user asked for "matchups sorted by number of
  // matches"; wr falls back as the tiebreak for equal-volume pairs.
  const nonMirror = detail.matchups
    .filter(m => !m.isMirror)
    .sort((a, b) => b.games - a.games || b.wr - a.wr)
  return (
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

      {/* DECKLISTS — featured deck (2/3) + recent-decks column (1/3, R16) */}
      <TabsContent value="decklists" className="mt-4">
        {decklists}
      </TabsContent>

      {/* MATCHUPS — this row vs all (shared MatchupList, games-ordered) */}
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
        {recentPage.visible.length > 0 ? (
          <aside className="order-1 min-w-0 md:order-2">
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

        {detail && (
          <CardBreakdown main={detail.mainCards} side={detail.sideCards} />
        )}
      </div>

      {/* One provenance footnote per tab, only when an MTGO event is on
          screen: MTGO records are partial (matches vs unpublished decks are
          not stored). */}
      {footnote && <p className="mt-2 text-[12px] text-ink-3">{footnote}</p>}
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
 *  width below (R13/R16). */
function CardBreakdown({
  main,
  side,
}: {
  main: CardAdoptionDTO[]
  side: CardAdoptionDTO[]
}) {
  return (
    <Collapsible defaultOpen={false} className="order-3 min-w-0 md:col-span-3">
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
