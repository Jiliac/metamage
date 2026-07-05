// Shared Gathering Ledger control styling for the LensBar (blueprint §9). Ported
// from the spike's `.chip` / `.knob` / `.share` treatments: 1px line border,
// transparent fill, ink-2 text, sharp chrome (no radius). Active chips get the
// gold fill; the Share control gets the gold accent and is pushed to the right.

export const knobClass =
  'inline-flex items-center gap-1.5 border border-line bg-transparent text-ink-2 ' +
  'text-[13px] tracking-[0.02em] px-3 py-[5px] cursor-pointer transition-colors ' +
  'hover:border-line-strong hover:text-ink ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/** Active/pressed chip — gold fill on the background color (§9 rule 1). */
export const chipActiveClass =
  'bg-gold border-gold text-bg font-semibold hover:text-bg'

/** Share control — gold accent, pushed right. Uses the raw --gold-wash var on
 *  hover (not exposed as a Tailwind color utility). */
export const shareClass =
  'ml-auto text-gold border-gold-soft hover:bg-[var(--gold-wash)] hover:text-gold'
