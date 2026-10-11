import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getDataSource } from '@/datasource'
import type { ArchetypeRef, DeckDTO } from '@/datasource/types'
import {
  buildHref,
  parseDeckId,
  parseDecksPage,
  parseMetaQuery,
  asArchetypeSlug,
  isArchetypeSlug,
} from '@/lib/params'
import { pickFeaturedDeck, sliceRecentDecks } from '@/lib/decks'
import { buildPageMetadata } from '@/lib/seo'

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
// Archetype detail (WP5 + U7). RSC. resolveSlug() first — stale/renamed slugs
// 302 to the canonical URL (keeping ?deck), unknown slugs 404. Radix tabs are
// driven by `?tab=`: the active tab seeds `defaultValue`; all four panels are
// server-rendered. The Decklists tab shows the featured deck (KTD4) plus a
// recent-decks column driven by `?deck`/`?decks` (KTD6/KTD8); `deck` resolves
// by entry id + archetype ignoring the window, and never enters the canonical
// URL — like `?row` today.
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
  // Malformed route segments 404 before any data-source call (slug discipline).
  if (!isArchetypeSlug(slug)) notFound()
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
  // Malformed route segments 404 before any data-source call (slug discipline).
  if (!isArchetypeSlug(slug)) notFound()
  const sp = await searchParams

  const query = parseMetaQuery(format, sp)
  const tab = readTab(sp)
  // Route extras, never in the MetaQuery (KTD6/KTD8): `deck` is validated
  // against a UUID pattern BEFORE any data call so garbage cannot reach the
  // datasource; `decks` clamps to the cap's last page.
  const deckId = parseDeckId(typeof sp.deck === 'string' ? sp.deck : undefined)
  const decksPage = parseDecksPage(sp)
  const ds = getDataSource()

  // Slug discipline: redirect stale slugs, 404 unknown ones. The redirect
  // keeps the selected deck so a shared deep link survives a rename (KTD6).
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
        deck: deckId,
      })
    )
  }

  const [detail, entries, deckParamDeck] = await Promise.all([
    ds.getArchetypeDetail({ ...query, slug: canonical.slug }),
    ds.getArchetypeEntries({ ...query, slug: canonical.slug }),
    deckId
      ? ds.getDeck({ format: query.format, entryId: deckId })
      : Promise.resolve<DeckDTO | null>(null),
  ])
  if (!detail) notFound()

  // ---- Deck selection (KTD6 flow) ----
  const featured = pickFeaturedDeck(entries.entries)
  // `getDeck` is keyed on the entry id only, so an other-format entry still
  // returns; it falls back to the featured deck instead of redirecting.
  const picked =
    deckParamDeck && deckParamDeck.format === query.format
      ? deckParamDeck
      : null
  if (picked && picked.archetype.slug !== canonical.slug) {
    // The entry was reclassified into another archetype of this format —
    // send the reader there with the selection kept (KTD6).
    redirect(
      buildHref(query.format, query, {
        path: `/archetype/${picked.archetype.slug}`,
        tab: tab === 'decklists' ? undefined : tab,
        deck: deckId,
      })
    )
  }
  // Inside the loaded window entries = inside the window (the list is the
  // newest ARCHETYPE_ENTRIES_CAP rows of the window).
  const outsideWindow =
    !!picked && !entries.entries.some(e => e.id === picked.entry.id)
  const deck: DeckDTO | null =
    picked ??
    (featured
      ? await ds.getDeck({ format: query.format, entryId: featured.id })
      : null)

  // KTD8: the page slices the cached list, so the RSC payload carries only
  // the rendered rows — no API route, no client fetching.
  const recentPage = sliceRecentDecks(entries.entries, entries.total, decksPage)

  const { archetype, summary } = detail
  const tier = tierLabel(summary.tier)
  const record = `${summary.wins}-${summary.losses}-${summary.draws}`

  // Order by match volume — the user asked for "matchups sorted by number of
  // matches"; wr falls back as the tiebreak for equal-volume pairs.
  const nonMirror = detail.matchups
    .filter(m => !m.isMirror)
    .sort((a, b) => b.games - a.games || b.wr - a.wr)

  const archPath = `/archetype/${canonical.slug}`
  // Forward the deck only when it actually resolved to the shown deck.
  const shownDeckId = deck && deck.entry.id === deckId ? deckId : undefined
  const tabHref = (t: TabKey) =>
    buildHref(query.format, query, {
      path: archPath,
      tab: t,
      // The selection survives tab switches (KTD6).
      deck: shownDeckId,
    })
  // Recent-deck rows keep the current ?decks page and set ?deck (KTD6/KTD8).
  const deckHref = (entryId: string) =>
    buildHref(query.format, query, {
      path: archPath,
      tab: 'decklists',
      deck: entryId,
      decks: decksPage,
    })
  const olderHref = recentPage.hasMore
    ? buildHref(query.format, query, {
        path: archPath,
        tab: 'decklists',
        deck: shownDeckId,
        decks: decksPage + 1,
      })
    : null
  // "Back to featured" drops the selection, keeping the lens + decks page.
  const backToFeaturedHref =
    featured && deck && deck.entry.id !== featured.id
      ? buildHref(query.format, query, {
          path: archPath,
          tab: 'decklists',
          decks: decksPage,
        })
      : null

  // The recent-decks list renders once — inside the mobile "Other decks"
  // control (which keeps it visible on desktop) or, with no decks at all,
  // directly in the column.
  const recentColumn = (
    <RecentDecks
      page={recentPage}
      featuredId={featured?.id ?? null}
      activeId={deck?.entry.id}
      deckHref={deckHref}
      olderHref={olderHref}
    />
  )

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

        {/* DECKLISTS — featured deck (2/3) + recent-decks column (1/3, R16) */}
        <TabsContent value="decklists" className="mt-4">
          <DeckNavProvider>
            <div className="flex flex-col gap-6 md:grid md:grid-cols-3 md:gap-x-6">
              {/* Recent decks. On mobile they collapse into the "Other decks"
                  control above the deck (R16); keyed on the shown deck id so
                  a pick closes it (R17). On desktop the list shows directly. */}
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
                  {outsideWindow && (
                    <p className="mb-4 border border-line bg-surface px-4 py-3 text-[13px] text-ink-2 shadow-ledger">
                      This deck is no longer in the current window — showing it
                      anyway.
                    </p>
                  )}
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
                      No featured decklist — no decklists were published in the
                      last 14 days of play.
                    </div>
                  )}
                </DeckDim>
              </div>

              {/* Card breakdown — the aggregate tables, collapsed by default
                  and full width below (R13/R16). */}
              <Collapsible
                defaultOpen={false}
                className="order-3 min-w-0 md:col-span-3"
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold flex w-full items-center justify-between border border-line bg-surface px-4 py-3 text-[13px] font-semibold text-ink shadow-ledger hover:text-gold"
                  >
                    Card breakdown
                    <span aria-hidden className="text-ink-3">
                      <span className="group-data-[state=open]:hidden">+</span>
                      <span className="hidden group-data-[state=open]:inline">
                        −
                      </span>
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div className="min-w-0">
                      <h3 className="eyebrow mb-2">Maindeck</h3>
                      <CardAdoptionTable
                        cards={detail.mainCards}
                        board="MAIN"
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="eyebrow mb-2">Sideboard</h3>
                      <CardAdoptionTable
                        cards={detail.sideCards}
                        board="SIDE"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </DeckNavProvider>
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
