'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { MetaQuery, MetaSort } from '@/datasource/types'
import {
  buildHref,
  parseMatrixTopN,
  parseMetaQuery,
  parseSort,
} from '@/lib/params'
import { capture } from '@/lib/analytics'

// ---------------------------------------------------------------------------
// The one place the app writes view state. The URL is the single source of
// truth (blueprint §6): this hook reads the current lens off the path + query,
// and `setParams(patch)` merges a change, serializes it back through the SAME
// pure `buildHref`, `router.push`es it, and fires the `reparameterize` funnel.
// No client store, no context — state lives in the URL.
// ---------------------------------------------------------------------------

// The lens fields a control may change. `format` is NOT here — format is a path
// segment changed by FormatPicker (navigation), not a lens reparameterization.
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
  sort?: MetaSort
  matrixTopN?: number
  tab?: string
}

/** Split `/meta/{format}/{...rest}` into its format and route suffix. */
function parsePath(pathname: string): { format: string; subPath: string } {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'meta' || parts.length < 2)
    return { format: '', subPath: '' }
  const rest = parts.slice(2)
  return { format: parts[1], subPath: rest.length ? `/${rest.join('/')}` : '' }
}

export type UseMetaParams = {
  format: string
  query: MetaQuery
  sort: MetaSort
  matrixTopN: number
  tab: string | undefined
  /** Route suffix after `/meta/{format}` — '' | '/matrix' | '/archetype/{slug}' | … */
  subPath: string
  setParams: (patch: MetaParamsPatch) => void
}

export function useMetaParams(): UseMetaParams {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { format, subPath } = useMemo(() => parsePath(pathname), [pathname])

  const query = useMemo(
    () => parseMetaQuery(format, searchParams),
    [format, searchParams]
  )
  const sort = useMemo(() => parseSort(searchParams), [searchParams])
  const matrixTopN = useMemo(
    () => parseMatrixTopN(searchParams),
    [searchParams]
  )
  const tab = searchParams.get('tab') ?? undefined

  const setParams = useCallback(
    (patch: MetaParamsPatch) => {
      const next: MetaQuery = {
        format: query.format,
        start: patch.start ?? query.start,
        end: patch.end ?? query.end,
        topN: patch.topN ?? query.topN,
        minMatches: patch.minMatches ?? query.minMatches,
        includeArchetypes: patch.includeArchetypes ?? query.includeArchetypes,
        hideBuckets: patch.hideBuckets ?? query.hideBuckets,
        weight: patch.weight ?? query.weight,
      }
      const nextSort = patch.sort ?? sort
      const nextMatrixTopN = patch.matrixTopN ?? matrixTopN
      const nextTab = patch.tab ?? tab

      const changedKeys: string[] = []
      if (next.start !== query.start || next.end !== query.end) {
        changedKeys.push('window')
      }
      if (next.topN !== query.topN) changedKeys.push('topN')
      if (next.minMatches !== query.minMatches) changedKeys.push('minMatches')
      if (next.weight !== query.weight) changedKeys.push('weight')
      if (next.hideBuckets !== query.hideBuckets) changedKeys.push('buckets')
      if (
        next.includeArchetypes.join(',') !== query.includeArchetypes.join(',')
      ) {
        changedKeys.push('add')
      }
      if (nextSort !== sort) changedKeys.push('sort')
      if (nextMatrixTopN !== matrixTopN) changedKeys.push('matrixTopN')
      if (nextTab !== tab) changedKeys.push('tab')

      if (changedKeys.length === 0) return

      const href = buildHref(format, next, {
        path: subPath,
        sort: nextSort,
        matrixTopN: nextMatrixTopN,
        tab: nextTab,
      })

      capture('reparameterize', {
        format,
        changedKeys,
        start: next.start,
        end: next.end,
        topN: next.topN,
        minMatches: next.minMatches,
        weight: next.weight,
        hideBuckets: next.hideBuckets,
        addCount: next.includeArchetypes.length,
        sort: nextSort,
        matrixTopN: nextMatrixTopN,
      })

      router.push(href)
    },
    [format, subPath, query, sort, matrixTopN, tab, router]
  )

  return { format, query, sort, matrixTopN, tab, subPath, setParams }
}
