'use client'

import * as React from 'react'

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// CardPreview — the card-image popover (KTD9). Opens on pointer hover and on
// keyboard focus, toggles on tap for touch pointers, and closes on Escape or
// an outside tap. It is built on the existing Radix Popover (the tap-capable
// pattern from LensBar/WindowPicker.tsx) with a PopoverAnchor instead of a
// Trigger, so the click-to-toggle is ours to scope to touch pointers — a
// desktop click never fights the hover state.
//
// The popover content never takes focus (open auto-focus suppressed), so Tab
// moves straight to the next card name and the blur closes the previous
// preview (KTD9). Images are plain lazy `img`s — not next/image — so they
// spend no Vercel image-optimization quota, and they mount only when the
// popover opens (R8). Each face sits in an aspect-ratio-reserving box so
// layout doesn't shift while loading (R7). A double-faced card shows both
// faces side by side on desktop and stacked on mobile; a face that fails to
// load falls back to the card name.
//
// Semantics: the anchor button takes over what a Radix Trigger would set —
// aria-haspopup="dialog", aria-expanded, and aria-controls pointing at the
// content (role=dialog, labelled with the card name) while it is open.
// ---------------------------------------------------------------------------

/** Scryfall `normal` prints are 488×680; the box reserves that ratio. */
const FACE_WIDTH = 488
const FACE_HEIGHT = 680
const FACE_BOX_CLASS =
  'bg-raised aspect-[488/680] w-52 max-md:w-44 overflow-hidden'

/** Grace period so the pointer can travel from the name into the preview. */
const CLOSE_DELAY_MS = 120

export type CardPreviewProps = {
  /** Scryfall's top-level name — "A // B" on double-faced cards. */
  name: string
  /** The display label rendered inside the trigger button. */
  label: string
  imageNormal: string
  /** Back-face URL; null on single-faced cards. */
  imageBack: string | null
  className?: string
}

export function CardPreview({
  name,
  label,
  imageNormal,
  imageBack,
  className,
}: CardPreviewProps) {
  const [open, setOpen] = React.useState(false)
  // The pointer type that last pressed the trigger. Focus events cannot tell
  // a tap from a keyboard focus, so the tap path records it explicitly (and
  // blur clears it, keeping later keyboard focus working).
  const pointerRef = React.useRef<string | null>(null)
  const closeTimer = React.useRef<number | null>(null)
  const contentId = React.useId()

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const scheduleClose = React.useCallback(() => {
    if (closeTimer.current !== null) return
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }, [])

  React.useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    },
    []
  )

  const isMouse = (e: React.PointerEvent) => e.pointerType === 'mouse'
  const [frontAlt, backAlt] = name.split(' // ')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          className={cn(
            'text-left font-semibold text-ink hover:text-gold hover:underline hover:underline-offset-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold',
            className
          )}
          onPointerDown={e => {
            pointerRef.current = e.pointerType
          }}
          onPointerEnter={e => {
            if (isMouse(e)) {
              cancelClose()
              setOpen(true)
            }
          }}
          onPointerLeave={e => {
            if (isMouse(e)) scheduleClose()
          }}
          onFocus={() => {
            // A touch tap focuses too, but its pointerup owns the toggle.
            if (pointerRef.current !== 'touch') setOpen(true)
          }}
          onBlur={() => {
            pointerRef.current = null
            cancelClose()
            setOpen(false)
          }}
          onPointerUp={e => {
            // Touch pointers toggle on tap (R7); mouse clicks are no-ops —
            // hover already opened the preview.
            if (e.pointerType !== 'mouse') setOpen(o => !o)
          }}
        >
          {label}
        </button>
      </PopoverAnchor>
      <PopoverContent
        id={contentId}
        aria-label={name}
        side="right"
        align="start"
        sideOffset={8}
        className="w-auto border-line bg-surface p-2 shadow-ledger"
        onOpenAutoFocus={e => e.preventDefault()}
        onPointerEnter={e => {
          if (isMouse(e)) cancelClose()
        }}
        onPointerLeave={e => {
          if (isMouse(e)) scheduleClose()
        }}
      >
        <div className="flex max-md:flex-col gap-1.5">
          <FaceImage src={imageNormal} alt={frontAlt || name} />
          {imageBack && <FaceImage src={imageBack} alt={backAlt || name} />}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** One card face in its ratio-reserving box; a broken image shows the face
 *  name instead of the browser's broken-image glyph. */
function FaceImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <div className={FACE_BOX_CLASS}>
      {failed ? (
        <span className="flex h-full items-center justify-center p-3 text-center text-[13px] font-semibold text-ink-2">
          {alt}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- KTD9: plain lazy img, not next/image (no optimization quota)
        <img
          src={src}
          alt={alt}
          width={FACE_WIDTH}
          height={FACE_HEIGHT}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  )
}

export default CardPreview
