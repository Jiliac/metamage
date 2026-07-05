'use client'

import * as React from 'react'
import { X } from 'lucide-react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { ArchetypeRef, ArchetypeSlug } from '@/datasource/types'
import { useMetaParams } from '@/hooks/useMetaParams'

import { knobClass } from './styles'

// ---------------------------------------------------------------------------
// ArchetypeAdder — the "+ Add archetype" combobox (§6, the Goldfish
// differentiator). Small archetypes fall below the minMatches floor; forcing one
// in appends its slug to `add=` so wide-CI fringe decks become visible.
//
// The candidate list is a plain `ArchetypeRef[]` PROP: the server provides it
// (blueprint hands WP7/WP5 the format's archetypes via listFormats/searchArchetypes)
// so filtering is synchronous here. NOTE FOR WP7: pass the full per-format
// archetype list (or a searchArchetypes result) into `archetypes`.
// ---------------------------------------------------------------------------

export type ArchetypeAdderProps = {
  archetypes: ArchetypeRef[]
}

export function ArchetypeAdder({ archetypes }: ArchetypeAdderProps) {
  const { query, setParams } = useMetaParams()
  const [q, setQ] = React.useState('')

  const added = query.includeArchetypes
  const addedSet = new Set<string>(added)
  const nameBySlug = new Map<string, string>(
    archetypes.map(a => [a.slug, a.name] as [string, string])
  )

  const needle = q.trim().toLowerCase()
  const filtered = archetypes
    .filter(a => !addedSet.has(a.slug) && a.name.toLowerCase().includes(needle))
    .slice(0, 8)

  const add = (slug: ArchetypeSlug) => {
    setParams({ includeArchetypes: [...added, slug] })
    setQ('')
  }
  const remove = (slug: ArchetypeSlug) => {
    setParams({ includeArchetypes: added.filter(s => s !== slug) })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={knobClass}>
          + Add archetype
          {added.length > 0 && (
            <span className="ml-1 font-semibold text-gold">
              · {added.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 border-line bg-surface text-ink"
      >
        <div className="grid gap-2">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search archetypes…"
            className="border border-line bg-bg px-2 py-1.5 text-[13px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold"
          />

          {added.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {added.map(slug => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => remove(slug)}
                  aria-label={`Remove ${nameBySlug.get(slug) ?? slug}`}
                  className="inline-flex items-center gap-1 border border-gold-soft px-2 py-0.5 text-[12px] text-gold hover:bg-[var(--gold-wash)]"
                >
                  {nameBySlug.get(slug) ?? slug}
                  <X className="size-3" aria-hidden />
                </button>
              ))}
            </div>
          )}

          <div className="grid max-h-56 gap-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-[12.5px] text-ink-3">
                {archetypes.length === 0
                  ? 'No archetypes available.'
                  : 'No archetypes match.'}
              </p>
            ) : (
              filtered.map(a => (
                <button
                  key={a.slug}
                  type="button"
                  onClick={() => add(a.slug)}
                  className="px-2 py-1 text-left text-[13px] text-ink hover:bg-[var(--gold-wash)] hover:text-gold"
                >
                  {a.name}
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ArchetypeAdder
