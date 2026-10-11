import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { getDataSource } from '@/datasource'
import {
  buildHref,
  parseDeckId,
  parseDecksPage,
  parseMetaQuery,
  asArchetypeSlug,
  isArchetypeSlug,
} from '@/lib/params'
import { resolveDeckSelection } from '@/lib/deck-selection'
import { buildPageMetadata } from '@/lib/seo'

import {
  ArchetypeHeader,
  ArchetypeTabs,
  DecklistsTab,
  PageFooter,
  readTab,
  type TabKey,
} from './sections'

// ---------------------------------------------------------------------------
// Archetype detail (WP5 + U7). RSC. resolveSlug() first — stale/renamed slugs
// 307 to the canonical URL (keeping ?deck), unknown slugs 404. Radix tabs are
// driven by `?tab=`: the active tab seeds `defaultValue`; all four panels are
// server-rendered. The Decklists tab shows the featured deck (KTD4) plus a
// recent-decks column driven by `?deck`/`?decks` (KTD6/KTD8); `deck` resolves
// by entry id + archetype ignoring the window, and never enters the canonical
// URL — like `?row` today. The slug → deck flow lives in
// `@/lib/deck-selection`; the sections in `./sections`.
// ---------------------------------------------------------------------------

type RouteParams = { format: string; slug: string }
type SearchParams = Record<string, string | string[] | undefined>

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

  // Slug discipline + the KTD6 deck flow. Redirects (307, keeping ?deck) for
  // stale slugs and reclassified decks; 404 for unknown slugs.
  const selection = await resolveDeckSelection(getDataSource(), {
    query,
    slug: asArchetypeSlug(slug),
    deckId,
    // Omit the default tab so the redirect target stays clean.
    tab: tab === 'decklists' ? undefined : tab,
  })
  if (selection.kind === 'redirect') redirect(selection.href)
  if (selection.kind === 'notFound') notFound()

  const { canonical, detail, deck } = selection
  const archPath = `/archetype/${canonical.slug}`
  // Forward the deck only when it actually resolved to the shown deck.
  const shownDeckId = deck && deck.entry.id === deckId ? deckId : undefined
  // The selection survives tab switches (KTD6).
  const tabHref = (t: TabKey) =>
    buildHref(query.format, query, {
      path: archPath,
      tab: t,
      deck: shownDeckId,
    })
  const decklists = (
    <DecklistsTab
      selection={selection}
      query={query}
      archPath={archPath}
      decksPage={decksPage}
      shownDeckId={shownDeckId}
    />
  )

  // Without window data (only reachable with a valid ?deck) the page shows
  // the deck alone; its colors stand in when it still belongs here.
  const color =
    detail?.archetype.color ??
    (selection.reclassifiedTo ? null : (deck?.archetype.color ?? null))

  return (
    <>
      <ArchetypeHeader
        format={format}
        name={detail?.archetype.name ?? canonical.name}
        color={color}
        summary={detail?.summary ?? null}
      />
      {detail ? (
        <ArchetypeTabs
          tab={tab}
          tabHref={tabHref}
          detail={detail}
          decklists={decklists}
        />
      ) : (
        <div className="mt-8">{decklists}</div>
      )}
      <PageFooter href={tabHref(detail ? tab : 'decklists')} />
    </>
  )
}
