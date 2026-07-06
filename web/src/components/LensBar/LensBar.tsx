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
  variant?: 'meta' | 'matrix'
}

export function LensBar({
  formats,
  archetypes,
  variant = 'meta',
}: LensBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="View parameters"
      className="clip-notch mt-5 flex flex-wrap items-center gap-2.5 border border-line bg-surface px-3.5 py-3"
    >
      <FormatPicker formats={formats} />
      <div role="none" className="mx-1 w-px self-stretch bg-line" />
      <WindowPicker />
      <KnobsPopover variant={variant} />
      <ArchetypeAdder archetypes={archetypes} />
      <ShareButton />
    </div>
  )
}

export default LensBar
