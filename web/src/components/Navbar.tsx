'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Menu, Moon, Sun, X } from 'lucide-react'

import { buildHref } from '@/lib/params'
import { cn, CONTAINER_CLASS } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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

/** Lens-preserving nav links — reads the parsed lens and rebuilds each href.
 *  `linkClass` lets the mobile disclosure panel reuse the same href logic. */
function NavLinks({ linkClass: linkCls }: { linkClass?: string }) {
  const { format, subPath, query, sort, matrixTopN, row } = useMetaParams()
  return (
    <>
      {NAV_ITEMS.map(item => {
        // Meta and Matchups both carry a matrix, so the mobile list's `?row`
        // travels between them like the LensBar knobs do; other routes drop it.
        const hasMatrix = item.sub === '' || item.sub === '/matrix'
        const href = buildHref(format, query, {
          path: item.sub,
          sort: item.sub === '' ? sort : undefined,
          matrixTopN: item.sub === '/matrix' ? matrixTopN : undefined,
          row: hasMatrix ? row : undefined,
        })
        const active = isActive(item.sub, subPath)
        return (
          <Link
            key={item.label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(navLinkClass, linkCls, active && navLinkActiveClass)}
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
function NavLinksFallback({ linkClass: linkCls }: { linkClass?: string }) {
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
            className={cn(navLinkClass, linkCls, active && navLinkActiveClass)}
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
      className="inline-grid size-11 place-items-center border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold md:size-8"
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

/** Mobile-only 44px-hit-area row link class, layered over `navLinkClass`. */
const navLinkMobileClass = 'flex min-h-11 items-center'

const brandClass =
  'font-display text-[22px] font-bold tracking-[0.02em] text-ink no-underline'

function Brand() {
  return (
    <Link href="/" className={brandClass}>
      Meta<span className="text-gold">Mage</span>
    </Link>
  )
}

/** Below `md`: brand, a 44px disclosure toggle and the theme toggle on one
 *  row, with the nav links in a collapsible panel beneath (U1/R2). */
function MobileShell() {
  // SSR renders the menu closed with a static Menu glyph; the mounted-guard
  // swaps to the X glyph after hydration so the server markup never
  // mismatches (same pattern as the ThemeToggle guard).
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const pathname = usePathname()
  React.useEffect(() => setMounted(true), [])
  // Close the panel after navigation (link tap or back/forward) so it never
  // covers the top of the new route. Effect-only state change post-mount.
  React.useEffect(() => setMenuOpen(false), [pathname])

  return (
    <Collapsible
      open={menuOpen}
      onOpenChange={setMenuOpen}
      className="md:hidden"
    >
      <div className="flex items-baseline gap-7 pt-6 pb-4">
        <Brand />
        <div className="ml-auto flex items-center gap-2 self-center">
          {/* Radix wires aria-expanded / aria-controls to its own content id. */}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label="Toggle navigation menu"
              className="inline-grid size-11 place-items-center border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {mounted && menuOpen ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
            </button>
          </CollapsibleTrigger>
          <ThemeToggle />
        </div>
      </div>
      <CollapsibleContent>
        <nav className="flex flex-col gap-1 pt-1 pb-4" aria-label="Primary">
          <React.Suspense
            fallback={<NavLinksFallback linkClass={navLinkMobileClass} />}
          >
            <NavLinks linkClass={navLinkMobileClass} />
          </React.Suspense>
        </nav>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** At `md` and up: the original single-row header, unchanged. */
function DesktopShell() {
  return (
    <div className="hidden items-baseline gap-7 pt-6 pb-4 md:flex">
      <Brand />
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
  )
}

export function Navbar() {
  return (
    <header>
      <div className={CONTAINER_CLASS}>
        <MobileShell />
        <DesktopShell />
        <hr className="wubrg-rule" />
      </div>
    </header>
  )
}

export default Navbar
