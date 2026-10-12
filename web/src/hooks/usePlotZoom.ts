'use client'

import * as React from 'react'

import {
  isZoomed,
  zoomView,
  type PlotRect,
  type Point,
  type View,
} from '@/lib/zoom'

// ---------------------------------------------------------------------------
// usePlotZoom — pinch/pan/wheel zoom for a Recharts plot (the scatter). Bind
// the returned props to the element wrapping the ResponsiveContainer; the plot
// rect is read from the chart's own clip-path, so it tracks margins and axis
// widths without duplicating them.
//
//   • two fingers pinch around their midpoint (and pan as it moves)
//   • one finger / mouse drag pans, only while zoomed — unzoomed, a vertical
//     swipe still scrolls the page (`touch-action: pan-y`)
//   • ctrl+wheel (what trackpad pinch sends) zooms around the cursor
//   • double-tap / double-click resets
// A drag or pinch swallows the click it ends on, so panning across a dot never
// opens its archetype page.
// ---------------------------------------------------------------------------

type Gesture = { start: View; from: Point; d0: number }

const TAP_SLOP = 6 // px a finger may wander before a tap becomes a drag
const DOUBLE_TAP_MS = 300

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

export type PlotZoom = {
  /** Current window; equals `full` when not zoomed. */
  view: View
  zoomed: boolean
  reset: () => void
  bind: {
    ref: React.RefObject<HTMLDivElement | null>
    style: React.CSSProperties
    onPointerDown: React.PointerEventHandler
    onPointerMove: React.PointerEventHandler
    onPointerUp: React.PointerEventHandler
    onPointerCancel: React.PointerEventHandler
    onClickCapture: React.MouseEventHandler
    onDoubleClick: React.MouseEventHandler
  }
}

export function usePlotZoom(
  full: View,
  min: { u: number; y: number }
): PlotZoom {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [view, setView] = React.useState<View | null>(null)
  const pointers = React.useRef(new Map<number, Point>())
  const gesture = React.useRef<Gesture | null>(null)
  const moved = React.useRef(false)
  const lastTap = React.useRef<{ t: number; p: Point } | null>(null)

  const current = view ?? full
  const zoomed = isZoomed(current, full)
  // Refs for the native listeners, which outlive a render.
  const live = React.useRef({ current, full, min })
  live.current = { current, full, min }

  // A new field (window, filters) is a new plot: drop the old window.
  const fullKey = `${full.u0}|${full.u1}|${full.y0}|${full.y1}`
  React.useEffect(() => setView(null), [fullKey])

  const commit = React.useCallback((v: View) => {
    setView(isZoomed(v, live.current.full) ? v : null)
  }, [])

  /** Plot rect + the svg's page offset, or null before the chart mounts. */
  const geometry = React.useCallback((): {
    rect: PlotRect
    origin: Point
  } | null => {
    const svg = ref.current?.querySelector('svg.recharts-surface')
    const clip = svg?.querySelector(':scope > defs > clipPath > rect')
    if (!svg || !clip) return null
    const box = svg.getBoundingClientRect()
    const n = (a: string) => Number(clip.getAttribute(a) ?? 0)
    return {
      rect: { x: n('x'), y: n('y'), width: n('width'), height: n('height') },
      origin: { x: box.left, y: box.top },
    }
  }, [])

  const local = (e: { clientX: number; clientY: number }, o: Point): Point => ({
    x: e.clientX - o.x,
    y: e.clientY - o.y,
  })

  const begin = () => {
    const pts = [...pointers.current.values()]
    const start = live.current.current
    gesture.current =
      pts.length >= 2
        ? { start, from: mid(pts[0], pts[1]), d0: dist(pts[0], pts[1]) }
        : pts.length === 1
          ? { start, from: pts[0], d0: 0 }
          : null
  }

  const onPointerDown: React.PointerEventHandler = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const g = geometry()
    if (!g) return
    if (pointers.current.size === 0) moved.current = false
    pointers.current.set(e.pointerId, local(e, g.origin))
    begin()
  }

  const onPointerMove: React.PointerEventHandler = e => {
    if (!pointers.current.has(e.pointerId)) return
    const g = geometry()
    const gs = gesture.current
    if (!g || !gs) return
    pointers.current.set(e.pointerId, local(e, g.origin))
    const pts = [...pointers.current.values()]
    const { full: f, min: m } = live.current

    if (pts.length >= 2 && gs.d0 > 0) {
      moved.current = true
      const d = Math.max(1, dist(pts[0], pts[1]))
      commit(
        zoomView(
          gs.start,
          f,
          m,
          g.rect,
          gs.from,
          mid(pts[0], pts[1]),
          gs.d0 / d
        )
      )
      return
    }
    // One pointer: pan, but only inside a zoomed window.
    if (!isZoomed(gs.start, f)) return
    if (!moved.current && dist(gs.from, pts[0]) < TAP_SLOP) return
    if (!moved.current) {
      moved.current = true
      // Capture late, so a plain tap still clicks the dot under it. Capture
      // throws if the pointer already ended; the pan works without it.
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        // pointer gone — nothing to capture
      }
    }
    commit(zoomView(gs.start, f, m, g.rect, gs.from, pts[0], 1))
  }

  const end: React.PointerEventHandler = e => {
    const p = pointers.current.get(e.pointerId)
    if (!p) return
    pointers.current.delete(e.pointerId)
    // Lifting one finger of a pinch hands over to a pan from where it is.
    begin()
    if (e.type !== 'pointerup' || e.pointerType !== 'touch' || moved.current)
      return
    const now = e.timeStamp
    const prev = lastTap.current
    if (prev && now - prev.t < DOUBLE_TAP_MS && dist(prev.p, p) < 30) {
      lastTap.current = null
      setView(null)
    } else {
      lastTap.current = { t: now, p }
    }
  }

  const onClickCapture: React.MouseEventHandler = e => {
    if (!moved.current) return
    e.preventDefault()
    e.stopPropagation()
    moved.current = false
  }

  // Native listeners: wheel must be non-passive to stop the page zooming, and
  // Safari's proprietary gesture events would otherwise pinch the page.
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return // plain wheel keeps scrolling the page
      const g = geometry()
      if (!g) return
      e.preventDefault()
      const p = local(e, g.origin)
      const { current: c, full: f, min: m } = live.current
      commit(zoomView(c, f, m, g.rect, p, p, Math.exp(e.deltaY * 0.01)))
    }
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', stop)
    el.addEventListener('gesturechange', stop)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', stop)
      el.removeEventListener('gesturechange', stop)
    }
  }, [geometry, commit])

  return {
    view: current,
    zoomed,
    reset: () => setView(null),
    bind: {
      ref,
      style: { touchAction: zoomed ? 'none' : 'pan-y' },
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onClickCapture,
      onDoubleClick: () => setView(null),
    },
  }
}
