import type { MetadataRoute } from 'next'

// Allow crawling of every public route. Only `/api/` (future data endpoints) is
// disallowed — the OG previews live at `/og` (blueprint §2) precisely so this
// blanket `/api/` disallow never blocks link-unfurl bots from the OG card.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
