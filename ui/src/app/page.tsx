import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <main className="container mx-auto px-6 pt-20 pb-16 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-white mb-4">
            Meta<span className="text-cyan-400">Mage</span>
          </h1>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl">
            MTG Tournament Analysis & Chat Logs Interface
          </p>
        </div>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="text-4xl mb-4">🃏</div>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Hello World
            </h2>
            <p className="text-slate-400 mb-6">
              Welcome to your MTG tournament analysis dashboard. This NextJS app
              will display chat logs and tournament insights.
            </p>

            <div className="space-y-2 text-sm text-slate-500">
              <div className="flex justify-between">
                <span>Framework:</span>
                <span className="text-cyan-400">Next.js 15.5.2</span>
              </div>
              <div className="flex justify-between">
                <span>Styling:</span>
                <span className="text-cyan-400">Tailwind CSS v4</span>
              </div>
              <div className="flex justify-between">
                <span>Components:</span>
                <span className="text-cyan-400">shadcn/ui</span>
              </div>
              <div className="flex justify-between">
                <span>Package Manager:</span>
                <span className="text-cyan-400">pnpm</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8">
          <Button asChild size="lg" className="bg-cyan-600 hover:bg-cyan-700">
            <Link href="/sessions">View Chat Sessions →</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}
