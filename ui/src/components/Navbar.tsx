'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-700">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="flex items-center justify-between h-16">
          {/* Logo + Brand */}
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/favicon-32x32.png"
              alt="MetaMage Logo"
              width={32}
              height={32}
              className="rounded"
            />
            <span className="text-xl font-bold text-white">
              Meta<span className="text-cyan-400">Mage</span>
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant={pathname === '/' ? 'secondary' : 'ghost'}
              size="sm"
            >
              <Link href="/">Home</Link>
            </Button>
            <Button
              asChild
              variant={pathname.startsWith('/sessions') ? 'secondary' : 'ghost'}
              size="sm"
            >
              <Link href="/sessions">Sessions</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
