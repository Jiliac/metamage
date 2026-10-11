'use client'

import { PLATFORMS, PLATFORM_LABELS } from '@/datasource/platform'
import { cn } from '@/lib/utils'
import { useMetaParams } from '@/hooks/useMetaParams'

import { chipActiveClass, knobClass } from './styles'

// ---------------------------------------------------------------------------
// PlatformPicker — All / Online / Paper chips. Online is Magic Online; paper is
// every tabletop source (Melee, CardsRealm, …). Writes `?platform` through
// useMetaParams like every other lens control; "All" is the default and
// leaves the URL clean.
// ---------------------------------------------------------------------------

export function PlatformPicker() {
  const { query, setParams } = useMetaParams()

  return (
    <div className="flex gap-0.5" role="group" aria-label="Platform">
      {PLATFORMS.map(p => {
        const active = query.platform === p
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) setParams({ platform: p })
            }}
            className={cn(knobClass, active && chipActiveClass)}
          >
            {PLATFORM_LABELS[p]}
          </button>
        )
      })}
    </div>
  )
}

export default PlatformPicker
