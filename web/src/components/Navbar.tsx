'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

import { buildHref } from '@/lib/params'
import { cn } from '@/lib/utils'
import {
  formatFromPathname,
  subPathFromPathname,
  useMetaParams,
} from '@/hooks/useMetaParams'

// ---------------------------------------------------------------------------
// Navbar — site chrome (§9): brand with gold "Mage", primary nav with a gold
// active underline, a theme toggle, and the WUBRG hairline rendered directly
// under the header (§9 rule 6). Nav links preserve the current lens via
// buildHref so moving between views (Meta / Matchups / Changes / Tournaments)
// keeps the window + knobs.
//
// The lens-preserving links read useSearchParams, so that consumer lives inside
// a <Suspense> boundary here; the fallback renders plain per-format links so the
// header never blocks static rendering of the rest of the layout.
// ---------------------------------------------------------------------------

type NavItem = { label: string; sub: string }

const NAV_ITEMS: NavItem[] = [
  { label: 'Meta', sub: '' },
  { label: 'Matchups', sub: '/matrix' },
  { label: 'Changes', sub: '/changes' },
  { label: 'Tournaments', sub: '/tournaments' },
]

const OTHER_SUBS = ['/matrix', '/changes', '/tournaments']

function isActive(itemSub: string, subPath: string): boolean {
  if (itemSub === '') return !OTHER_SUBS.includes(subPath)
  return subPath === itemSub
}

const navLinkClass =
  'border-b-2 border-transparent py-0.5 text-[13.5px] tracking-[0.04em] text-ink-2 no-underline transition-colors hover:text-ink ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold'
const navLinkActiveClass = 'border-gold text-gold'

/** Lens-preserving nav links — reads the parsed lens and rebuilds each href. */
function NavLinks() {
  const { format, subPath, query, sort, matrixTopN } = useMetaParams()
  return (
    <>
      {NAV_ITEMS.map(item => {
        const href = buildHref(format, query, {
          path: item.sub,
          sort: item.sub === '' ? sort : undefined,
          matrixTopN: item.sub === '/matrix' ? matrixTopN : undefined,
        })
        const active = isActive(item.sub, subPath)
        return (
          <Link
            key={item.label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(navLinkClass, active && navLinkActiveClass)}
          >
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

/** Static fallback while the searchParams-reading links suspend — plain links to
 *  each view at the current format, without lens preservation. */
function NavLinksFallback() {
  const pathname = usePathname()
  const format = formatFromPathname(pathname)
  const subPath = subPathFromPathname(pathname)
  return (
    <>
      {NAV_ITEMS.map(item => {
        const active = isActive(item.sub, subPath)
        return (
          <Link
            key={item.label}
            href={`/meta/${format}${item.sub}`}
            aria-current={active ? 'page' : undefined}
            className={cn(navLinkClass, active && navLinkActiveClass)}
          >
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="inline-grid size-8 place-items-center border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-4" aria-hidden />
        ) : (
          <Moon className="size-4" aria-hidden />
        )
      ) : (
        <span className="size-4" aria-hidden />
      )}
    </button>
  )
}

export function Navbar() {
  return (
    <header>
      <div className="mx-auto max-w-[1120px] px-7">
        <div className="flex items-baseline gap-7 pt-6 pb-4">
          <Link
            href="/"
            className="font-display text-[22px] font-bold tracking-[0.02em] text-ink no-underline"
          >
            Meta<span className="text-gold">Mage</span>
          </Link>
          <nav
            className="ml-auto flex items-center gap-[22px]"
            aria-label="Primary"
          >
            <React.Suspense fallback={<NavLinksFallback />}>
              <NavLinks />
            </React.Suspense>
            <ThemeToggle />
          </nav>
        </div>
        <hr className="wubrg-rule" />
      </div>
    </header>
  )
}

export default Navbar
