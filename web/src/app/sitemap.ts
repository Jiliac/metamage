import type { MetadataRoute } from 'next'
import { getDataSource } from '@/datasource'
import type { FormatDTO } from '@/datasource/types'

// Enumerate `formats × core routes` at their default (current-month) window.
// At the default window `buildHref` omits every param, so the canonical URLs are
// the clean `/meta/{slug}[/sub]` forms — exactly what SSG prebuilds. Archetype
// detail pages are intentionally omitted (their top-N set is prebuilt per format
// but the long tail is unbounded — do not enumerate the infinite space, §8.8).

/** Per-format routes that exist at the default window (blueprint §2 table). */
const CORE_SUBROUTES = ['', '/matrix', '/changes', '/tournaments'] as const

/** Fallback if the data source can't be reached at build time (§5 formats). */
const FALLBACK_SLUGS = [
  'pauper',
  'modern',
  'legacy',
  'pioneer',
  'standard',
  'vintage',
  'duel-commander',
] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const now = new Date()

  let slugs: string[]
  try {
    const formats: FormatDTO[] = await getDataSource().listFormats()
    slugs = formats.map(f => String(f.slug))
    if (slugs.length === 0) slugs = [...FALLBACK_SLUGS]
  } catch {
    slugs = [...FALLBACK_SLUGS]
  }

  const urls: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now },
  ]
  for (const slug of slugs) {
    for (const sub of CORE_SUBROUTES) {
      urls.push({ url: `${baseUrl}/meta/${slug}${sub}`, lastModified: now })
    }
  }
  return urls
}
