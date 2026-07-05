import type { MetadataRoute } from 'next'
import { getDataSource } from '@/datasource'
import type { FormatDTO } from '@/datasource/types'
import { buildHref, parseMetaQuery } from '@/lib/params'

// Enumerate every format × core route at its default (current-month) window.
// Format is a path segment (blueprint §2), so the sitemap is a clean cartesian
// product over `listFormats()`. Default-window URLs are the canonical, prebuilt
// landings — `buildHref` omits the default lens, yielding `/meta/{format}[/...]`.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// Route suffixes after `/meta/{format}` that exist per format (blueprint §2).
const CORE_PATHS = ['', '/matrix', '/changes', '/tournaments'] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const lastModified = now.toISOString()

  let formats: FormatDTO[]
  try {
    formats = await getDataSource().listFormats()
  } catch {
    formats = []
  }

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
  ]

  for (const f of formats) {
    const q = parseMetaQuery(f.slug, {}, now)
    for (const path of CORE_PATHS) {
      entries.push({
        url: `${SITE_URL}${buildHref(f.slug, q, { path, now })}`,
        lastModified,
        changeFrequency: path === '/changes' ? 'daily' : 'hourly',
        priority: path === '' ? 0.9 : 0.6,
      })
    }
  }

  return entries
}
