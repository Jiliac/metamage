import * as React from 'react'
import Image from 'next/image'

import { cn } from '@/lib/utils'
import { toManaColors, CHIP_VAR, type ManaColor } from '@/components/ManaPips'

// ---------------------------------------------------------------------------
// ArtCrop — shared identity primitive (§9 rule 3 + rule 4: "cards are round").
// Renders a signature-card Scryfall art_crop when a URL is present; otherwise a
// deterministic mana-gradient placeholder built from the archetype's colors.
// The component fills its parent (position it and give it a size); it owns the
// rounded corner because it is a card-like object.
// ---------------------------------------------------------------------------

/** Build a layered mana gradient from the archetype's colors (or a neutral
 *  parchment wash when colorless/unknown). Used as the null-art fallback. */
function manaGradient(colors: ManaColor[]): string {
  if (colors.length === 0) {
    return 'linear-gradient(135deg, var(--raised), var(--line-strong))'
  }
  if (colors.length === 1) {
    const c = CHIP_VAR[colors[0]]
    return `radial-gradient(120% 140% at 30% 20%, ${c}, var(--raised) 78%)`
  }
  const stops = colors
    .map((c, i) => {
      const pct = Math.round((i / (colors.length - 1)) * 100)
      return `${CHIP_VAR[c]} ${pct}%`
    })
    .join(', ')
  return `linear-gradient(135deg, ${stops})`
}

export type ArtCropProps = {
  /** Scryfall `art_crop` URL, or null → mana-gradient placeholder. */
  url: string | null | undefined
  /** Guild/color code driving the placeholder gradient. */
  colors: string | readonly string[] | null | undefined
  /** Card name for alt text (decorative art gets an empty alt otherwise). */
  cardName?: string | null
  /** Corner radius in px — cards are round (§9). Default 8. */
  radius?: number
  /** `sizes` hint for next/image (fill layout). */
  sizes?: string
  /** Load eagerly (above-the-fold tiles). Defaults to lazy. */
  priority?: boolean
  className?: string
}

/**
 * Fills its (positioned, sized) parent with card art or a mana gradient.
 * Server-renderable. When `url` is set it uses next/image against the
 * Scryfall remotePattern configured in next.config.ts.
 */
export function ArtCrop({
  url,
  colors,
  cardName,
  radius = 8,
  sizes = '(max-width: 768px) 100vw, 400px',
  priority = false,
  className,
}: ArtCropProps) {
  const mana = toManaColors(colors)
  const rounded = { borderRadius: radius } as const

  if (!url) {
    return (
      <div
        aria-hidden
        className={cn('absolute inset-0 h-full w-full', className)}
        style={{ ...rounded, background: manaGradient(mana) }}
      />
    )
  }

  return (
    <Image
      src={url}
      alt={cardName ?? ''}
      fill
      sizes={sizes}
      priority={priority}
      // Skip Next's image optimizer: Scryfall art_crop is already CDN-served at
      // a fixed size, and proxying a burst of these through the optimizer trips
      // Scryfall's WAF (the "upstream image response failed … 400" errors). The
      // browser now fetches Scryfall directly — the intended, cache-friendly use.
      unoptimized
      className={cn('object-cover', className)}
      style={rounded}
    />
  )
}

export default ArtCrop
