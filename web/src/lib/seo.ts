import type { Metadata } from 'next'
import type { ArchetypeSlug, FormatSlug, MetaQuery } from '@/datasource/types'
import { buildHref, type BuildHrefOpts } from '@/lib/params'

// ---------------------------------------------------------------------------
// One helper builds every page's <head>: canonical URL, OpenGraph, Twitter card
// and the deep-linked `/og` preview image. Everything derives from the same
// (format, MetaQuery) pair via `buildHref`, so canonical == shareable == OG URL
// == the image's own lens — no drift. Mirrors the legacy `ui/` metadata shape.
// ---------------------------------------------------------------------------

/** Which OG card the `/og` route should draw. */
export type OgView = 'meta' | 'archetype' | 'matrix'

export type BuildPageMetadataArgs = {
  view: OgView
  format: FormatSlug | string
  /** The parsed lens; its window threads into both the canonical URL and OG. */
  query: MetaQuery
  title: string
  description: string
  /** Route extras (path/sort/matrixTopN/tab) forwarded to `buildHref`. */
  href?: BuildHrefOpts
  /** Archetype slug — only for `view: 'archetype'`; threads into the OG image. */
  slug?: ArchetypeSlug | string
}

/**
 * Deep-linked `/og` preview URL carrying the full lens the file-based
 * `opengraph-image` convention can't see (it only gets path params). Always
 * pins `start`/`end` so the rendered card is deterministic and cache-stable.
 */
export function ogImageHref(args: BuildPageMetadataArgs): string {
  const p = new URLSearchParams()
  p.set('view', args.view)
  p.set('format', String(args.format))
  p.set('start', args.query.start)
  p.set('end', args.query.end)
  if (args.slug) p.set('slug', String(args.slug))
  if (args.href?.matrixTopN !== undefined) {
    p.set('n', String(args.href.matrixTopN))
  }
  return `/og?${p.toString()}`
}

/**
 * Build a page's `Metadata`: title + description, a `buildHref`-derived
 * canonical (relative — Next resolves it against `metadataBase`), the matching
 * `openGraph.url`, and both OG + Twitter images pointed at the `/og` route.
 */
export function buildPageMetadata(args: BuildPageMetadataArgs): Metadata {
  const canonical = buildHref(args.format, args.query, args.href)
  const image = ogImageHref(args)
  return {
    title: args.title,
    description: args.description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title: args.title,
      description: args.description,
      images: [{ url: image, width: 1200, height: 630, alt: args.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: args.title,
      description: args.description,
      images: [image],
    },
  }
}
