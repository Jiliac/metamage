import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
