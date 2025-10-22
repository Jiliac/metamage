'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="fixed top-0 left-0 w-full bg-[#0a0f1f]/70 backdrop-blur-md border-b border-white/10 z-50">
      <div className="max-w-6xl mx-auto flex items-center px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Image
            src="/favicon-32x32.png"
            alt="MetaMage Logo"
            width={24}
            height={24}
            className="rounded"
          />
          <span className="text-white font-bold text-lg">
            Meta<span className="text-sky-400">Mage</span>
          </span>
        </Link>

        <div className="flex-1 flex justify-center gap-8 text-gray-300 text-base font-semibold">
          <Link
            href="/"
            className={`hover:text-sky-400 transition ${pathname === '/' ? 'text-sky-400' : ''}`}
          >
            Home
          </Link>
          <Link
            href="/sessions"
            className={`hover:text-sky-400 transition ${pathname.startsWith('/sessions') ? 'text-sky-400' : ''}`}
          >
            Sessions
          </Link>
          <Link
            href="/mana"
            className={`hover:text-sky-400 transition ${pathname.startsWith('/mana') ? 'text-sky-400' : ''}`}
          >
            Mana Tables
          </Link>
        </div>
      </div>
    </nav>
  )
}
