import type {
  ArchetypeDetailDTO,
  ArchetypeEntriesDTO,
  ArchetypeRef,
  ArchetypeSlug,
  DeckDTO,
  DeckSummaryDTO,
  MetaDataSource,
  MetaQuery,
} from '@/datasource/types'
import { isOutsideWindow, pickFeaturedDeck } from '@/lib/decks'
import { buildHref } from '@/lib/params'

// ---------------------------------------------------------------------------
// The archetype page's slug + deck flow (KTD6), kept out of the RSC so it can
// be unit-tested against a stub source. It returns a discriminated result and
// never calls `redirect()`/`notFound()` itself — the page does. Order:
//   1. resolveSlug: unknown → notFound; stale → redirect to the canonical slug
//      (keeping ?tab/?deck).
//   2. detail + entries + the `?deck` lookup in parallel. With no `?deck`, the
//      featured getDeck chains off the entries so it overlaps the detail read.
//   3. A `?deck` reclassified into archetype B redirects to B only when B has
//      window data and resolves to itself (no 404, no loop); otherwise the deck
//      renders here with a "now classified as B" note.
//   4. No window data for this archetype: the `?deck` deep link (window-
//      independent) still renders; without one, notFound.
// ---------------------------------------------------------------------------

export type DeckSelectionSource = Pick<
  MetaDataSource,
  'resolveSlug' | 'getArchetypeDetail' | 'getArchetypeEntries' | 'getDeck'
>

export type DeckSelectionInput = {
  query: MetaQuery
  /** The route segment, already checked by `isArchetypeSlug`. */
  slug: ArchetypeSlug
  /** The parsed `?deck` (UUID-validated), if any. */
  deckId: string | undefined
  /** The non-default tab to keep on redirects (undefined for decklists). */
  tab: string | undefined
}

export type DeckSelection =
  | { kind: 'redirect'; href: string }
  | { kind: 'notFound' }
  | {
      kind: 'ok'
      canonical: ArchetypeRef
      /** Null when the archetype has no matches in the window — only reached
       *  with a valid `?deck`, which the page then shows on its own. */
      detail: ArchetypeDetailDTO | null
      entries: ArchetypeEntriesDTO
      featured: DeckSummaryDTO | null
      /** The shown deck: the `?deck` pick, else the featured deck. */
      deck: DeckDTO | null
      /** R11: the picked deck's date falls outside the window. */
      outsideWindow: boolean
      /** The picked deck's current archetype when it differs from this page's
       *  and the redirect was not safe (B has no window data, or B's slug does
       *  not resolve to itself). */
      reclassifiedTo: ArchetypeRef | null
    }

const archetypeHref = (
  input: DeckSelectionInput,
  slug: ArchetypeSlug
): string =>
  buildHref(input.query.format, input.query, {
    path: `/archetype/${slug}`,
    tab: input.tab,
    deck: input.deckId,
  })

/** True when B is a safe redirect target: a different archetype whose slug
 *  resolves to itself (so B's page will not bounce again) and that has data
 *  in the current window (so B's page will not 404). */
async function canRedirectTo(
  ds: DeckSelectionSource,
  query: MetaQuery,
  from: ArchetypeSlug,
  to: ArchetypeSlug
): Promise<boolean> {
  const ref = await ds.resolveSlug(query.format, to)
  if (!ref || ref.slug !== to || ref.slug === from) return false
  return (await ds.getArchetypeDetail({ ...query, slug: to })) !== null
}

/** The featured pick's full deck (KTD4), or null with no candidates. */
function featuredDeckFor(
  ds: DeckSelectionSource,
  query: MetaQuery,
  entries: ArchetypeEntriesDTO
): Promise<DeckDTO | null> {
  const featured = pickFeaturedDeck(entries.entries)
  return featured
    ? ds.getDeck({ format: query.format, entryId: featured.id })
    : Promise.resolve(null)
}

export async function resolveDeckSelection(
  ds: DeckSelectionSource,
  input: DeckSelectionInput
): Promise<DeckSelection> {
  const { query, deckId } = input
  const canonical = await ds.resolveSlug(query.format, input.slug)
  if (!canonical) return { kind: 'notFound' }
  if (canonical.slug !== input.slug) {
    return { kind: 'redirect', href: archetypeHref(input, canonical.slug) }
  }

  const archQ = { ...query, slug: canonical.slug }
  const entriesP = ds.getArchetypeEntries(archQ)
  // No `?deck`: start the featured read as soon as the entries land, so it
  // overlaps getArchetypeDetail instead of running after it. With a `?deck`
  // it waits, so a valid pick costs no featured query.
  const [detail, entries, requested, featuredDeck] = await Promise.all([
    ds.getArchetypeDetail(archQ),
    entriesP,
    deckId ? ds.getDeck({ format: query.format, entryId: deckId }) : null,
    deckId ? undefined : entriesP.then(e => featuredDeckFor(ds, query, e)),
  ])

  // `getDeck` is keyed on the entry id only, so an other-format entry still
  // returns; it falls back to the featured deck instead of redirecting.
  const picked = requested?.format === query.format ? requested : null
  const moved = picked && picked.archetype.slug !== canonical.slug
  if (
    moved &&
    (await canRedirectTo(ds, query, canonical.slug, picked.archetype.slug))
  ) {
    return {
      kind: 'redirect',
      href: archetypeHref(input, picked.archetype.slug),
    }
  }
  if (!detail && !picked) return { kind: 'notFound' }

  const deck =
    picked ??
    (featuredDeck !== undefined
      ? featuredDeck
      : await featuredDeckFor(ds, query, entries))
  return {
    kind: 'ok',
    canonical,
    detail,
    entries,
    featured: pickFeaturedDeck(entries.entries),
    deck,
    // Decided by the deck's date, not by membership in the loaded entries:
    // the list is capped, so an in-window deck past the cap is still inside.
    outsideWindow: !!picked && isOutsideWindow(picked.entry.event.date, query),
    reclassifiedTo: moved
      ? { slug: picked.archetype.slug, name: picked.archetype.name }
      : null,
  }
}
