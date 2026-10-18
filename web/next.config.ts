import type { NextConfig } from 'next'

// Every page reads `searchParams` (the lens), which makes Next render it
// dynamically and send `Cache-Control: private, no-store` — so `revalidate`
// never reaches the CDN and each crawler hit is a full function render. The
// Vercel-only header outranks Cache-Control at Vercel's CDN (browsers never see
// it); the CDN keys on the full URL, query included, so every lens caches
// separately. One hour matches the data layer's `unstable_cache` TTL, and a
// deploy purges it.
const PAGE_CDN_CACHE = 's-maxage=3600, stale-while-revalidate=86400'

const nextConfig: NextConfig = {
  async headers() {
    return ['/meta/:path*', '/sitemap.xml'].map(source => ({
      source,
      headers: [{ key: 'Vercel-CDN-Cache-Control', value: PAGE_CDN_CACHE }],
    }))
  },
  images: {
    // Signature-card art is served straight from Scryfall's CDN (art_crop),
    // with attribution in the footer. The strict-CSP OG route stays asset-
    // embedded; only next/image on the app pages reaches out here.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cards.scryfall.io',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig
