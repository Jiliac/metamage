'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { FormatSlug, MetaQuery, MetaSort } from '@/datasource/types'
import {
  asFormatSlug,
  buildHref,
  parseMatrixTopN,
  parseMetaQuery,
  parseSort,
} from '@/lib/params'
import { capture } from '@/lib/analytics'

// ---------------------------------------------------------------------------
// useMetaParams — the URL-is-state runtime (blueprint §6). Wraps the App-Router
// navigation hooks and exposes the parsed lens plus a single `setParams(patch)`
// mutator. Every lens change flows through here so the `reparameterize` capture
// fires from exactly one choke point.
//
// Format is a PATH segment (`/meta/{format}/...`), not a query param — read from
// `usePathname`. The sub-path after the format (`/matrix`, `/archetype/{slug}`,
// `/changes`, …) is preserved across param changes so a knob edit never bounces
// the user off their current view. `sort` (?sort) and `matrixTopN` (?n) live
// outside the `MetaQuery` object but are round-tripped so they survive too.
//
// NOTE: this reads `useSearchParams`, which opts a route into client rendering
// unless the consumer is wrapped in <Suspense>. WP5/WP7 own that boundary at the
// page/layout level (Navbar wraps its own consumer internally).
// ---------------------------------------------------------------------------

const DEFAULT_FORMAT = 'pauper'

/** The subset of `MetaQuery` fields the lens can mutate, plus the route extras
 *  (`format` path segment, `sort`, `matrixTopN`) serialized alongside it. */
export type MetaParamsPatch = Partial<
  Pick<
    MetaQuery,
    | 'start'
    | 'end'
    | 'topN'
    | 'minMatches'
    | 'includeArchetypes'
    | 'hideBuckets'
    | 'weight'
  >
> & {
  format?: FormatSlug | string
  sort?: MetaSort
  matrixTopN?: number
}

/** Extract the `{format}` path segment from `/meta/{format}/...`. */
export function formatFromPathname(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)
  if (seg[0] === 'meta' && seg[1]) return seg[1]
  return DEFAULT_FORMAT
}

/** Everything after `/meta/{format}` (leading slash kept), or '' at the root. */
export function subPathFromPathname(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)
  if (seg[0] === 'meta' && seg.length > 2) return '/' + seg.slice(2).join('/')
  return ''
}

export type UseMetaParams = {
  format: FormatSlug
  subPath: string
  query: MetaQuery
  sort: MetaSort
  matrixTopN: number
  setParams: (patch: MetaParamsPatch) => void
}

export function useMetaParams(): UseMetaParams {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const format = formatFromPathname(pathname)
  const subPath = subPathFromPathname(pathname)
  const query = parseMetaQuery(format, searchParams)
  const sort = parseSort(searchParams)
  const matrixTopN = parseMatrixTopN(searchParams)

  const setParams = useCallback(
    (patch: MetaParamsPatch) => {
      const current = parseMetaQuery(format, searchParams)
      const curSort = parseSort(searchParams)
      const curMatrixTopN = parseMatrixTopN(searchParams)

      const nextFormat = patch.format ?? format
      const nextQuery: MetaQuery = {
        format: asFormatSlug(nextFormat),
        start: patch.start ?? current.start,
        end: patch.end ?? current.end,
        topN: patch.topN ?? current.topN,
        minMatches: patch.minMatches ?? current.minMatches,
        includeArchetypes: patch.includeArchetypes ?? current.includeArchetypes,
        hideBuckets: patch.hideBuckets ?? current.hideBuckets,
        weight: patch.weight ?? current.weight,
      }

      const href = buildHref(nextFormat, nextQuery, {
        path: subPath,
        sort: patch.sort ?? curSort,
        matrixTopN: patch.matrixTopN ?? curMatrixTopN,
      })

      router.push(href)
      capture('reparameterize', {
        format: String(nextFormat),
        changedKeys: Object.keys(patch),
      })
    },
    [router, searchParams, format, subPath]
  )

  return {
    format: asFormatSlug(format),
    subPath,
    query,
    sort,
    matrixTopN,
    setParams,
  }
}

export default useMetaParams
