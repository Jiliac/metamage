import './globals.css'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Providers } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { Toaster } from '@/components/ui/sonner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ),
  title: {
    default: 'MetaMage – MTG Metagame Explorer',
    template: '%s | MetaMage',
  },
  description:
    'Self-serve Magic: The Gathering tournament metagame explorer — presence, win rates, matchup matrices, and tiers by format.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    title: 'MetaMage – MTG Metagame Explorer',
    description:
      'Self-serve Magic: The Gathering tournament metagame explorer — presence, win rates, matchup matrices, and tiers by format.',
    images: [{ url: '/logo.png', width: 1200, height: 630, alt: 'MetaMage' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MetaMage – MTG Metagame Explorer',
    description:
      'Self-serve Magic: The Gathering tournament metagame explorer.',
    images: ['/logo.png'],
  },
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Navbar />
          {children}
          <Toaster position="top-center" />
        </Providers>
      </body>
    </html>
  )
}
