import type { MetadataRoute } from 'next'

// Allow everything, keep crawlers out of the data endpoints under `/api/`, and
// point at the sitemap. `/og` deliberately lives OUTSIDE `/api/` so link
// previews stay crawlable while data routes stay hidden (blueprint §2).
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
