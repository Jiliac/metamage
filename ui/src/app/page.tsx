import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'

export function generateMetadata(): Metadata {
  return {
    title: 'Home',
    description:
      'MetaMage helps analyze MTG tournament results with smart tools, shareable outputs, and a clean UI.',
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: '/',
      title: 'MetaMage – MTG Tournament Analysis',
      description:
        'Analyze formats and archetypes, query the database, and browse shareable tool results.',
      images: ['/logo.png'],
    },
    twitter: {
      card: 'summary_large_image',
    },
  }
}

export default function Home() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'MetaMage',
    url: baseUrl,
    description:
      'Analyze MTG tournament data, explore archetypes, and share insights.',
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <main className="container mx-auto px-6 pt-32 pb-32 max-w-6xl">
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
        />

        {/* Hero */}
        <section className="text-center mb-20">
          <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-8">
            Meta<span className="text-cyan-400">Mage</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-3xl mx-auto mb-12">
            MTG tournament analysis made simple. Explore formats and archetypes,
            run ad‑hoc queries, and share results — all in one place.
          </p>

          <div className="flex items-center justify-center">
            <Button asChild size="lg" className="bg-cyan-600 hover:bg-cyan-700">
              <Link href="/sessions">View Chat Sessions →</Link>
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="grid md:grid-cols-3 gap-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                📊 Metagame Insights
              </CardTitle>
              <CardDescription>
                Track formats, archetypes, and matchup winrates.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-slate-300 text-sm">
              Use built-in tools to summarize meta changes, recent performance,
              and sources — quickly turning data into decisions.
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                🧰 Powerful Tools
              </CardTitle>
              <CardDescription>
                Query the database and get shareable results.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-slate-300 text-sm">
              Run ad‑hoc SQL with titled outputs, sortable tables, and links you
              can share with teammates.
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                🗂️ Organized Sessions
              </CardTitle>
              <CardDescription>
                Conversations with context, tools, and outputs.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-slate-300 text-sm">
              Every chat keeps its tool calls, titles, and results, so you can
              revisit insights anytime.
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
