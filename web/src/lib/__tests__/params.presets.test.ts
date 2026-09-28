import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDOW_CHIP,
  defaultWindow,
  expandPreset,
  matchPreset,
  matchWindowChip,
  PRESETS,
  PRESET_LABELS,
} from '@/lib/params'

const at = (iso: string, time = '12:00:00Z') => new Date(`${iso}T${time}`)

describe('expandPreset', () => {
  const now = at('2026-09-27')

  it('exposes exactly the rolling-window presets, all labelled', () => {
    expect([...PRESETS]).toEqual([
      'last-7d',
      'last-14d',
      'last-30d',
      'last-3m',
      'last-6m',
    ])
    for (const p of PRESETS) expect(PRESET_LABELS[p]).toMatch(/^Last /)
  })

  it('"Last N days" is N calendar days ending today (inclusive)', () => {
    expect(expandPreset('last-7d', now)).toEqual({
      start: '2026-09-21',
      end: '2026-09-27',
    })
    expect(expandPreset('last-14d', now)).toEqual({
      start: '2026-09-14',
      end: '2026-09-27',
    })
    expect(expandPreset('last-30d', now)).toEqual({
      start: '2026-08-29',
      end: '2026-09-27',
    })
  })

  it('"Last N months" starts the day after the same day-of-month N months back', () => {
    expect(expandPreset('last-3m', now)).toEqual({
      start: '2026-06-28',
      end: '2026-09-27',
    })
    expect(expandPreset('last-6m', now)).toEqual({
      start: '2026-03-28',
      end: '2026-09-27',
    })
  })

  it('crosses month and year boundaries', () => {
    const jan3 = at('2027-01-03')
    expect(expandPreset('last-7d', jan3)).toEqual({
      start: '2026-12-28',
      end: '2027-01-03',
    })
    expect(expandPreset('last-3m', jan3)).toEqual({
      start: '2026-10-04',
      end: '2027-01-03',
    })
    expect(expandPreset('last-6m', jan3)).toEqual({
      start: '2026-07-04',
      end: '2027-01-03',
    })
  })

  it('clamps to the target month end when the day does not exist', () => {
    // May 31 − 3 months → "Feb 31" → Feb 28 (2026) → +1 = Mar 1
    expect(expandPreset('last-3m', at('2026-05-31'))).toEqual({
      start: '2026-03-01',
      end: '2026-05-31',
    })
    // Aug 31 − 6 months → "Feb 31" → Feb 28 → +1 = Mar 1
    expect(expandPreset('last-6m', at('2026-08-31'))).toEqual({
      start: '2026-03-01',
      end: '2026-08-31',
    })
    // Dec 31 − 3 months → "Sep 31" → Sep 30 → +1 = Oct 1
    expect(expandPreset('last-3m', at('2026-12-31'))).toEqual({
      start: '2026-10-01',
      end: '2026-12-31',
    })
  })

  it('handles leap years (Feb 29)', () => {
    // 2024 is a leap year: Feb 1..29 + Mar 1 = 30 days; in 2025 it reaches Jan 31.
    expect(expandPreset('last-30d', at('2024-03-01'))).toEqual({
      start: '2024-02-01',
      end: '2024-03-01',
    })
    expect(expandPreset('last-30d', at('2025-03-01'))).toEqual({
      start: '2025-01-31',
      end: '2025-03-01',
    })
    expect(expandPreset('last-7d', at('2024-03-03'))).toEqual({
      start: '2024-02-26',
      end: '2024-03-03',
    })
    // May 29 − 3 months → Feb 29 (exists in 2024) → +1 = Mar 1
    expect(expandPreset('last-3m', at('2024-05-29'))).toEqual({
      start: '2024-03-01',
      end: '2024-05-29',
    })
    // May 28 − 3 months → Feb 28 → +1 = Feb 29
    expect(expandPreset('last-3m', at('2024-05-28'))).toEqual({
      start: '2024-02-29',
      end: '2024-05-28',
    })
    // Aug 31 − 6 months → "Feb 31" → Feb 29 → +1 = Mar 1
    expect(expandPreset('last-6m', at('2024-08-31'))).toEqual({
      start: '2024-03-01',
      end: '2024-08-31',
    })
  })

  it('uses the UTC calendar day of `now` regardless of time of day', () => {
    expect(expandPreset('last-7d', at('2026-09-27', '00:00:00Z'))).toEqual(
      expandPreset('last-7d', at('2026-09-27', '23:59:59.999Z'))
    )
  })
})

describe('matchPreset', () => {
  const now = at('2026-09-27')

  it('finds the preset whose expansion equals the window', () => {
    for (const p of PRESETS) {
      expect(matchPreset(expandPreset(p, now), now)).toBe(p)
    }
  })

  it('returns undefined for a custom window', () => {
    expect(
      matchPreset({ start: '2026-09-01', end: '2026-09-30' }, now)
    ).toBeUndefined()
  })
})

describe('matchWindowChip', () => {
  it('highlights "This month" on the default window and no preset (mid-month)', () => {
    const now = at('2026-09-15')
    expect(matchWindowChip(defaultWindow(now), now)).toBe(DEFAULT_WINDOW_CHIP)
    for (const p of PRESETS) {
      expect(matchWindowChip(expandPreset(p, now), now)).toBe(p)
    }
  })

  it('prefers the default chip when "Last 30 days" is the same window', () => {
    // Sep 30 of a 30-day month: "Last 30 days" expands to Sep 1 → Sep 30,
    // i.e. exactly the default window. Only the default chip is highlighted.
    const now = at('2026-09-30')
    const def = defaultWindow(now)
    expect(expandPreset('last-30d', now)).toEqual(def)
    expect(matchPreset(def, now)).toBe('last-30d')
    expect(matchWindowChip(def, now)).toBe(DEFAULT_WINDOW_CHIP)
  })

  it('returns undefined for a custom window', () => {
    const now = at('2026-09-15')
    expect(
      matchWindowChip({ start: '2026-08-01', end: '2026-08-31' }, now)
    ).toBeUndefined()
  })
})

describe('preset timezone (intentional UTC behaviour)', () => {
  it('ends on the UTC day even when the local day is still the previous one', () => {
    // 17:30 in UTC−7 on Sep 27 is 00:30 UTC on Sep 28: presets use the UTC
    // day (consistent with `defaultWindow` and server data), so "today" is
    // Sep 28 — the picker labels its presets "(UTC)" for this reason.
    const now = new Date('2026-09-27T17:30:00-07:00')
    expect(expandPreset('last-7d', now)).toEqual({
      start: '2026-09-22',
      end: '2026-09-28',
    })
  })
})
