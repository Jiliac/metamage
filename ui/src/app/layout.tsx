import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
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
    default: 'MetaMage – MTG Tournament Analysis',
    template: '%s | MetaMage',
  },
  description: 'MTG Tournament Analysis & Chat Logs Interface',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    title: 'MetaMage – MTG Tournament Analysis',
    description: 'MTG Tournament Analysis & Chat Logs Interface',
    images: [{ url: '/logo.png', width: 1200, height: 630, alt: 'MetaMage' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MetaMage – MTG Tournament Analysis',
    description: 'MTG Tournament Analysis & Chat Logs Interface',
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar />
        {children}
        <Toaster
          position="top-center"
          style={{ top: '30%', transform: 'translateY(-50%)' }}
        />
      </body>
    </html>
  )
}
