import './globals.css'
import type { Metadata } from 'next'

import { Providers } from './providers'
import { Navbar } from '@/components/Navbar'
import { Toaster } from '@/components/ui/sonner'

// ---------------------------------------------------------------------------
// Root shell (WP5). Establishes the <html>/<body> spine, the metadataBase +
// '%s | MetaMage' title template, the Gathering Ledger fonts (system stacks in
// globals.css — no next/font), the client Providers (next-themes + PostHog,
// owned by WP3), the site Navbar (WP3), the WUBRG hairline under the header
// (§9 rule 6), and the toaster mount.
//
// WP7: the OG defaults below are static; the per-route generateMetadata blocks
// point openGraph.images at the /og route once lib/seo lands.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ),
  title: {
    default: 'MetaMage — MTG Metagame Explorer',
    template: '%s | MetaMage',
  },
  description:
    'Self-serve Magic: The Gathering tournament metagame explorer — presence, win rates, matchup matrices, and tiers by format.',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/android-chrome-192x192.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <div className="mx-auto w-full max-w-[1120px] px-7 pb-24">
            {/* Navbar (WP3) renders the MetaMage brand + primary nav; it derives
                the active format from usePathname and preserves the lens via
                buildHref. The WUBRG hairline sits directly beneath it (§9). */}
            <Navbar />
            <hr className="wubrg-rule mb-0.5" />
            <main>{children}</main>
          </div>
        </Providers>
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
