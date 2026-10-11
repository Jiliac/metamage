'use client'

import type { FormatDTO } from '@/datasource/types'
import { ALL_FORMATS } from '@/datasource/format-order'
import { cn } from '@/lib/utils'
import { useMetaParams } from '@/hooks/useMetaParams'

import { knobClass, chipActiveClass } from './styles'

// ---------------------------------------------------------------------------
// FormatPicker — the format chips at the head of the LensBar (§9 spike). Format
// is the canonical PATH partition, so selecting a chip changes the path segment
// (via setParams) while preserving the rest of the lens. Active chip = gold fill.
// The list is server-provided (listFormats) — see LensBar props.
// ---------------------------------------------------------------------------

export type FormatPickerProps = {
  formats: FormatDTO[]
  /** Lead with an "All" chip (the cross-format tournaments list). */
  allowAll?: boolean
}

const ALL_CHIP: Pick<FormatDTO, 'slug' | 'name' | 'displayName'> = {
  slug: ALL_FORMATS as FormatDTO['slug'],
  name: 'All formats',
  displayName: 'All',
}

export function FormatPicker({ formats, allowAll = false }: FormatPickerProps) {
  const { format, setParams } = useMetaParams()
  const chips = allowAll ? [ALL_CHIP, ...formats] : formats

  return (
    <div className="flex flex-wrap gap-0.5" role="group" aria-label="Format">
      {chips.map(f => {
        const active = f.slug === format
        return (
          <button
            key={f.slug}
            type="button"
            aria-pressed={active}
            title={f.name}
            onClick={() => {
              if (!active) setParams({ format: f.slug })
            }}
            className={cn(knobClass, active && chipActiveClass)}
          >
            {f.displayName}
          </button>
        )
      })}
    </div>
  )
}

export default FormatPicker
