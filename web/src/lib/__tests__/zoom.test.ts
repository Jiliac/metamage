import { describe, expect, it } from 'vitest'

import {
  isZoomed,
  niceTicks,
  sqrtTicks,
  zoomView,
  type PlotRect,
  type View,
} from '@/lib/zoom'

// ---------------------------------------------------------------------------
// The scatter's pinch/pan/wheel math: a view is a window over the plot in the
// chart's own (√presence, win-rate) space, moved so the data point under the
// gesture's start stays under the fingers.
// ---------------------------------------------------------------------------

const FULL: View = { u0: 0, u1: 4, y0: 40, y1: 60 }
const RECT: PlotRect = { x: 0, y: 0, width: 400, height: 200 }
const MIN = { u: 0.5, y: 2 }

describe('zoomView', () => {
  it('zooms in around the anchor, keeping its data point under it', () => {
    // Centre of the plot is (u=2, y=50); halve both spans around it.
    const v = zoomView(
      FULL,
      FULL,
      MIN,
      RECT,
      { x: 200, y: 100 },
      { x: 200, y: 100 },
      0.5
    )
    expect(v).toEqual({ u0: 1, u1: 3, y0: 45, y1: 55 })
  })

  it('pans with k=1 by the finger travel, in data units', () => {
    const start: View = { u0: 1, u1: 3, y0: 45, y1: 55 }
    // Drag 100px left (¼ of the width): the window moves ¼ of its span right.
    const v = zoomView(
      start,
      FULL,
      MIN,
      RECT,
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      1
    )
    expect(v.u0).toBeCloseTo(1.5)
    expect(v.u1).toBeCloseTo(3.5)
    expect(v.y0).toBeCloseTo(45)
  })

  it('never leaves the full bounds when panning past an edge', () => {
    const start: View = { u0: 1, u1: 3, y0: 45, y1: 55 }
    const v = zoomView(
      start,
      FULL,
      MIN,
      RECT,
      { x: 200, y: 100 },
      { x: 2000, y: -2000 },
      1
    )
    expect(v.u0).toBe(0)
    expect(v.u1).toBe(2)
    expect(v.y0).toBe(40)
    expect(v.y1).toBe(50)
  })

  it('clamps the span between the minimum and the full extent', () => {
    const tight = zoomView(
      FULL,
      FULL,
      MIN,
      RECT,
      { x: 200, y: 100 },
      { x: 200, y: 100 },
      0.01
    )
    expect(tight.u1 - tight.u0).toBeCloseTo(MIN.u)
    expect(tight.y1 - tight.y0).toBeCloseTo(MIN.y)
    const wide = zoomView(
      FULL,
      FULL,
      MIN,
      RECT,
      { x: 50, y: 10 },
      { x: 50, y: 10 },
      10
    )
    expect(wide).toEqual(FULL)
  })
})

describe('isZoomed', () => {
  it('is false for the full view and true for any narrower window', () => {
    expect(isZoomed(FULL, FULL)).toBe(false)
    expect(isZoomed({ ...FULL, u1: 3.9 }, FULL)).toBe(true)
  })
})

describe('niceTicks', () => {
  it('picks a 1/2/5 step that gives at most six ticks inside the range', () => {
    expect(niceTicks(40, 65)).toEqual([40, 45, 50, 55, 60, 65])
    expect(niceTicks(47.3, 53.8)).toEqual([48, 49, 50, 51, 52, 53])
    expect(niceTicks(50.2, 51.1)).toEqual([50.5, 51])
  })
})

describe('sqrtTicks', () => {
  it('keeps the readable presence stops inside the window', () => {
    expect(sqrtTicks(0, 20)).toEqual([1, 5, 10, 15, 20])
    expect(sqrtTicks(1.5, 6.5)).toEqual([2, 3, 4, 5, 6])
  })
})
