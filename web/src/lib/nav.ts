import { DEFAULT_FORMAT, isAllFormats } from '@/datasource/format-order'

// ---------------------------------------------------------------------------
// Primary-nav routing rules for the Navbar: which item is active for a
// sub-path, and which format each item links to. Pure.
// ---------------------------------------------------------------------------

const OTHER_SUBS = ['/matrix', '/changes', '/tournaments']

/** `subPath` is `sub` itself or one of its children (`/tournaments/{id}`). */
function within(subPath: string, sub: string): boolean {
  return subPath === sub || subPath.startsWith(`${sub}/`)
}

/** Whether the nav item for `itemSub` ('' = Meta) is the current view.
 *  Meta also owns the sub-paths no other item claims (`/archetype/{slug}`). */
export function isNavActive(itemSub: string, subPath: string): boolean {
  if (itemSub === '') return !OTHER_SUBS.some(s => within(subPath, s))
  return within(subPath, itemSub)
}

/** Only the tournaments views exist for the `all` pseudo-format; every other
 *  view falls back to the default format. */
export function navFormat(format: string, itemSub: string): string {
  return isAllFormats(format) && itemSub !== '/tournaments'
    ? DEFAULT_FORMAT
    : format
}
