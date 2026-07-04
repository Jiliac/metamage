import './globals.css'
import type { Metadata } from 'next'
import { Toaster } from '@/components/ui/sonner'

// WP5 replaces this — the real shell adds <Providers> (next-themes + PostHog,
// WP3), <Navbar> (WP3) and the metadataBase/OG template wiring. This placeholder
// only establishes the <html>/<body> spine, the Gathering Ledger fonts (system
// stacks applied in globals.css per §9 — no next/font), and the toaster mount so
// the app builds and renders end-to-end on the frozen contract.

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
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
