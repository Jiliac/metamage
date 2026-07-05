import type { Metadata } from 'next'
import type {
  ArchetypeSlug,
  FormatSlug,
  MetaQuery,
  MetaSort,
} from '@/datasource/types'
import { buildHref, DEFAULTS } from '@/lib/params'

// ---------------------------------------------------------------------------
// SEO helper. `buildPageMetadata` is the single place every /meta route derives
// its <head> from. It reuses `buildHref` so the canonical URL, the OpenGraph
// `url`, and the ISR cache key are byte-identical, and points `openGraph.images`
// at the `/og` route handler (blueprint §2) with the full lens encoded so the OG
// card reproduces exactly the window/knobs the page is showing.
//
// The OG image href intentionally uses the SAME query-param names the lens does
// (`start`/`end`/`top`/`min`/`weight`/`buckets`/`add`) so `/og/route.tsx` can
// feed its raw searchParams straight into `parseMetaQuery`.
// ---------------------------------------------------------------------------

/** The three hand-drawn OG card layouts (blueprint §2 OpenGraph). */
export type OgView = 'meta' | 'archetype' | 'matrix'

export type BuildPageMetadataArgs = {
  view: OgView
  format: FormatSlug | string
  query: MetaQuery
  title: string
  description: string
  /** Route suffix after `/meta/{format}` (e.g. `/matrix`). Defaults per view. */
  path?: string
  /** Archetype detail slug — sets the default `path` and the OG `slug` param. */
  slug?: ArchetypeSlug | string
  /** Table sort key, mirrored into the canonical URL. */
  sort?: MetaSort
  /** Matrix top-N (matrix view only). */
  matrixTopN?: number
  /** Archetype-detail active tab (`?tab`). */
  tab?: string
}

/** Absolute-or-relative site base; Next resolves relatives via `metadataBase`. */
function effectivePath(a: BuildPageMetadataArgs): string | undefined {
  if (a.path) return a.path
  if (a.view === 'archetype' && a.slug) return `/archetype/${a.slug}`
  if (a.view === 'matrix') return '/matrix'
  return undefined
}

/** Serialize the full lens onto the `/og` route handler URL (§2). */
export function ogImageHref(a: BuildPageMetadataArgs): string {
  const p = new URLSearchParams()
  p.set('view', a.view)
  p.set('format', String(a.format))
  p.set('start', a.query.start)
  p.set('end', a.query.end)
  if (a.query.topN !== DEFAULTS.topN) p.set('top', String(a.query.topN))
  if (a.query.minMatches !== DEFAULTS.minMatches) {
    p.set('min', String(a.query.minMatches))
  }
  if (a.query.weight !== DEFAULTS.weight) p.set('weight', a.query.weight)
  if (a.query.hideBuckets !== DEFAULTS.hideBuckets) {
    p.set('buckets', a.query.hideBuckets ? 'hide' : 'show')
  }
  if (a.query.includeArchetypes.length) {
    p.set('add', a.query.includeArchetypes.join(','))
  }
  if (a.view === 'archetype' && a.slug) p.set('slug', String(a.slug))
  if (
    a.view === 'matrix' &&
    a.matrixTopN !== undefined &&
    a.matrixTopN !== DEFAULTS.matrixTopN
  ) {
    p.set('n', String(a.matrixTopN))
  }
  return `/og?${p.toString()}`
}

/**
 * Build a page's `Metadata`: canonical link, OpenGraph (url + hand-drawn OG
 * card) and a `summary_large_image` Twitter card. `canonical` and `openGraph.url`
 * both come from `buildHref`, so shareable == canonical == OG == cache key.
 */
export function buildPageMetadata(a: BuildPageMetadataArgs): Metadata {
  const path = effectivePath(a)
  const canonical = buildHref(a.format, a.query, {
    path,
    sort: a.sort,
    matrixTopN: a.view === 'matrix' ? a.matrixTopN : undefined,
    tab: a.tab,
  })
  const image = ogImageHref(a)
  return {
    title: a.title,
    description: a.description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: 'MetaMage',
      url: canonical,
      title: a.title,
      description: a.description,
      images: [{ url: image, width: 1200, height: 630, alt: a.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: a.title,
      description: a.description,
      images: [image],
    },
  }
}
