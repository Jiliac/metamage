'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { ArchetypeRef, FormatDTO } from '@/datasource/types'
import { isAllFormats } from '@/datasource/format-order'
import { PLATFORM_LABELS } from '@/datasource/platform'
import { useMetaParams } from '@/hooks/useMetaParams'
import { matchPreset, PRESET_LABELS } from '@/lib/params'
import { windowRangeLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ShareButton } from '@/components/ShareButton'

import { FormatPicker } from './FormatPicker'
import { WindowPicker } from './WindowPicker'
import { PlatformPicker } from './PlatformPicker'
import { KnobsPopover } from './KnobsPopover'
import { ArchetypeAdder } from './ArchetypeAdder'
import { knobClass } from './styles'

// ---------------------------------------------------------------------------
// LensBar — the notched-corner toolbar (§9 spike `.lens`): sharp cut chrome, a
// parchment surface, format chips + window knob + knobs popover + archetype
// adder, with the gold Share control pushed to the right. Every control writes
// the URL through useMetaParams; the bar holds no state of its own beyond the
// phone disclosure below.
//
// Below `md` the eleven controls would wrap into four rows and push the
// headline (and the matchup list, the moat) a screen down, so the bar opens as
// a one-line summary of the lens ("Modern · Last 30 days · Top 20 · ≥80
// matches") with Share beside it; tapping the summary reveals the controls.
// At `md` and up the summary row is not rendered and the controls are always
// visible, exactly as before.
//
// `formats` and `archetypes` are server-provided (listFormats / the format's
// archetype list). `variant='matrix'` surfaces the matrix-size (?n) knob.
// The All / Online / Paper platform chips ride with the window knob.
//
// NOTE FOR WP5/WP7: this subtree reads useSearchParams — wrap the rendered
// <LensBar> in a <Suspense> boundary at the page/layout level so the route can
// still statically render its shell.
// ---------------------------------------------------------------------------

export type LensBarProps = {
  formats: FormatDTO[]
  archetypes: ArchetypeRef[]
  variant?: 'meta' | 'matrix' | 'changes' | 'tournaments' | 'archetype'
  /** The window the page actually shows when it differs from the URL's
   *  (the overview's latest-populated-month fallback), so the window knob
   *  and the phone summary never label the figures with the wrong period. */
  shownWindow?: { start: string; end: string }
}

export function LensBar({
  formats,
  archetypes,
  variant = 'meta',
  shownWindow,
}: LensBarProps) {
  // R7 — per-route scoping: a control renders only where it can affect the
  // view. Knobs (topN / minMatches / weight / buckets) and the archetype adder
  // are meta+matrix concerns; the window knob also applies on tournaments
  // (its table is window-scoped); changes is format + share only.
  const showWindow =
    variant === 'meta' ||
    variant === 'matrix' ||
    variant === 'tournaments' ||
    variant === 'archetype'
  // The archetype page is already inside one format (the slug is per
  // format), so the format chips would only lead to 404s there.
  const showFormats = variant !== 'archetype'
  // Knobs (topN / minMatches / weight / buckets) and the archetype adder are
  // meta+matrix concerns (R7); the type narrowing below is what KnobsPopover
  // relies on, so it never has to gate itself.
  const knobsVariant =
    variant === 'meta' || variant === 'matrix' ? variant : null
  const showDivider = showFormats && (showWindow || knobsVariant !== null)

  const { query, matrixTopN } = useMetaParams()
  const [open, setOpen] = useState(false)
  const controlsId = useId()

  // The phone summary names only the parts of the lens this route uses.
  const formatName = isAllFormats(query.format)
    ? 'All formats'
    : (formats.find(f => f.slug === query.format)?.name ?? query.format)
  const win = shownWindow ?? query
  const preset = matchPreset(win)
  const summary = [
    formatName,
    showWindow &&
      (preset ? PRESET_LABELS[preset] : windowRangeLabel(win.start, win.end)),
    showWindow &&
      query.platform !== 'all' &&
      `${PLATFORM_LABELS[query.platform]} only`,
    knobsVariant === 'matrix' && `Grid ${matrixTopN}`,
    knobsVariant === 'meta' && `Top ${query.topN}`,
    knobsVariant && `≥${query.minMatches} matches`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="toolbar"
      aria-label="View parameters"
      className="clip-notch mt-5 border border-line bg-surface"
    >
      {/* Phone summary row — hidden from md up. */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 md:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={controlsId}
          onClick={() => setOpen(o => !o)}
          className={cn(knobClass, 'min-w-0 flex-1 justify-between')}
        >
          <span className="truncate text-ink">{summary}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 flex-none transition-transform duration-150 ease-out',
              open && 'rotate-180'
            )}
          />
        </button>
        <ShareButton compact className="ml-0" />
      </div>

      <div
        id={controlsId}
        className={cn(
          'flex flex-wrap items-center gap-2.5 px-3.5 py-3',
          'max-md:border-t max-md:border-line',
          !open && 'max-md:hidden'
        )}
      >
        {showFormats && (
          <FormatPicker
            formats={formats}
            allowAll={variant === 'tournaments'}
          />
        )}
        {showDivider && (
          <div role="none" className="mx-1 w-px self-stretch bg-line" />
        )}
        {showWindow && <WindowPicker shown={shownWindow} />}
        {/* The platform splits the same window's events, so it rides with
            the window wherever the window knob applies. */}
        {showWindow && <PlatformPicker />}
        {knobsVariant && <KnobsPopover variant={knobsVariant} />}
        {knobsVariant && <ArchetypeAdder archetypes={archetypes} />}
        {/* Share rides inside the first wrapped row (ml-auto within the flex
            flow), never banished to a lone row of its own. On phones it lives
            in the summary row instead. */}
        <span className="ml-auto max-md:hidden">
          <ShareButton />
        </span>
      </div>
    </div>
  )
}

export default LensBar
