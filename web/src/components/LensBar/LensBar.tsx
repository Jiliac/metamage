'use client'

import type { ArchetypeRef, FormatDTO } from '@/datasource/types'
import { ShareButton } from '@/components/ShareButton'

import { FormatPicker } from './FormatPicker'
import { WindowPicker } from './WindowPicker'
import { KnobsPopover } from './KnobsPopover'
import { ArchetypeAdder } from './ArchetypeAdder'

// ---------------------------------------------------------------------------
// LensBar — the notched-corner toolbar (§9 spike `.lens`): sharp cut chrome, a
// parchment surface, format chips + window knob + knobs popover + archetype
// adder, with the gold Share control pushed to the right. Every control writes
// the URL through useMetaParams; the bar holds no state of its own.
//
// `formats` and `archetypes` are server-provided (listFormats / the format's
// archetype list). `variant='matrix'` surfaces the matrix-size (?n) knob.
//
// NOTE FOR WP5/WP7: this subtree reads useSearchParams — wrap the rendered
// <LensBar> in a <Suspense> boundary at the page/layout level so the route can
// still statically render its shell.
// ---------------------------------------------------------------------------

export type LensBarProps = {
  formats: FormatDTO[]
  archetypes: ArchetypeRef[]
  variant?: 'meta' | 'matrix' | 'changes' | 'tournaments'
}

export function LensBar({
  formats,
  archetypes,
  variant = 'meta',
}: LensBarProps) {
  // R7 — per-route scoping: a control renders only where it can affect the
  // view. Knobs (topN / minMatches / weight / buckets) and the archetype adder
  // are meta+matrix concerns; the window knob also applies on tournaments
  // (its table is window-scoped); changes is format + share only.
  const showWindow =
    variant === 'meta' || variant === 'matrix' || variant === 'tournaments'
  // Knobs (topN / minMatches / weight / buckets) and the archetype adder are
  // meta+matrix concerns (R7); the type narrowing below is what KnobsPopover
  // relies on, so it never has to gate itself.
  const knobsVariant =
    variant === 'meta' || variant === 'matrix' ? variant : null
  const showDivider = showWindow || knobsVariant !== null

  return (
    <div
      role="toolbar"
      aria-label="View parameters"
      className="clip-notch mt-5 flex flex-wrap items-center gap-2.5 border border-line bg-surface px-3.5 py-3"
    >
      <FormatPicker formats={formats} />
      {showDivider && (
        <div role="none" className="mx-1 w-px self-stretch bg-line" />
      )}
      {showWindow && <WindowPicker />}
      {knobsVariant && <KnobsPopover variant={knobsVariant} />}
      {knobsVariant && <ArchetypeAdder archetypes={archetypes} />}
      {/* Share rides inside the first wrapped row (ml-auto within the flex
          flow), never banished to a lone row of its own. */}
      <ShareButton />
    </div>
  )
}

export default LensBar
