// ---------------------------------------------------------------------------
// Plot zoom math for the win-rate × presence scatter. A View is a window over
// the plot in the chart's own space — `u` is √presence (the x axis is a √
// scale, so equal pixels are equal `u`), `y` is win rate in percent. Gestures
// (pinch, pan, ctrl-wheel) all reduce to one move: scale the window's span by
// `k` and place it so the data point under `from` lands under `to`. Pure; the
// component owns the pointer bookkeeping.
// ---------------------------------------------------------------------------

export type View = { u0: number; u1: number; y0: number; y1: number }
export type PlotRect = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

/** Slide [lo, lo+span] inside [min, max] without changing its span. */
function fit(lo: number, span: number, min: number, max: number): number {
  return clamp(lo, min, max - span)
}

/**
 * The view after a gesture. `start` is the view when the gesture began, `from`
 * the gesture's starting point (pinch midpoint / drag origin) and `to` its
 * current point, both in plot pixels; `k` multiplies the span (<1 zooms in;
 * 1 is a pure pan). Spans clamp to [`min`, full extent] and the window never
 * leaves `full`.
 */
export function zoomView(
  start: View,
  full: View,
  min: { u: number; y: number },
  rect: PlotRect,
  from: Point,
  to: Point,
  k: number
): View {
  const fu = (from.x - rect.x) / rect.width
  const fy = (from.y - rect.y) / rect.height
  const tu = (to.x - rect.x) / rect.width
  const ty = (to.y - rect.y) / rect.height
  // The data point under the gesture's start, in the starting view.
  const au = start.u0 + fu * (start.u1 - start.u0)
  const ay = start.y1 - fy * (start.y1 - start.y0)

  const spanU = clamp((start.u1 - start.u0) * k, min.u, full.u1 - full.u0)
  const spanY = clamp((start.y1 - start.y0) * k, min.y, full.y1 - full.y0)

  const u0 = fit(au - tu * spanU, spanU, full.u0, full.u1)
  const y1 = fit(ay + ty * spanY - spanY, spanY, full.y0, full.y1) + spanY
  return { u0, u1: u0 + spanU, y0: y1 - spanY, y1 }
}

/** True when the view is narrower than the full extent on either axis. */
export function isZoomed(v: View, full: View): boolean {
  const eps = 1e-6
  return (
    v.u1 - v.u0 < full.u1 - full.u0 - eps ||
    v.y1 - v.y0 < full.y1 - full.y0 - eps
  )
}

/** Win-rate ticks: the smallest 0.5/1/2/5/10 step giving ≤6 ticks in range. */
export function niceTicks(lo: number, hi: number): number[] {
  for (const step of [0.5, 1, 2, 5, 10]) {
    const ticks: number[] = []
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
      ticks.push(Math.round(t * 10) / 10)
    }
    if (ticks.length <= 6) return ticks
  }
  return [lo, hi]
}

// Presence stops, coarse to fine; the first list with ≥3 stops in the window
// wins, so the full view keeps its familiar 1/5/10/15/20 labels.
const PRESENCE_STOPS: readonly (readonly number[])[] = [
  [1, 5, 10, 15, 20, 25, 30],
  [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30],
  [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20],
]

/** Presence ticks (in %) for the window [lo, hi] (in %). */
export function sqrtTicks(lo: number, hi: number): number[] {
  let inRange: number[] = []
  for (const stops of PRESENCE_STOPS) {
    inRange = stops.filter(t => t >= lo - 1e-9 && t <= hi + 1e-9)
    if (inRange.length >= 3) return inRange
  }
  return inRange
}
