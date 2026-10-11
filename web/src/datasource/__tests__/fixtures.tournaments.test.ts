import { describe, expect, it } from 'vitest'

import { FixtureDataSource } from '@/datasource/fixtures'
import { ALL_FORMATS } from '@/datasource/format-order'
import rawDb from '@/datasource/fixtures/data/db.json'
import { asIsoDate, parseMetaQuery } from '@/lib/params'
import { isEventId } from '@/lib/events'

const ds = new FixtureDataSource()
const now = new Date('2026-10-11T12:00:00Z')

// The first fixture window (every format shares the same month windows).
const { start, end } = rawDb.formats[0].windows[0]
const lens = (format: string) => ({
  ...parseMetaQuery(format, {}, now),
  start: asIsoDate(start),
  end: asIsoDate(end),
})

describe('FixtureDataSource tournaments', () => {
  it('tags every tournament with its format', async () => {
    const rows = await ds.getTournaments(lens('pauper'))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(t => t.format === 'pauper')).toBe(true)
  })

  it('lists every format for ALL_FORMATS, newest first', async () => {
    const all = await ds.getTournaments(lens(ALL_FORMATS))
    const perFormat = await Promise.all(
      rawDb.formats.map(f => ds.getTournaments(lens(f.slug)))
    )
    expect(all).toHaveLength(perFormat.flat().length)
    expect(new Set(all.map(t => t.format)).size).toBeGreaterThan(1)
    const dates = all.map(t => t.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('sums sources across formats for ALL_FORMATS', async () => {
    const all = await ds.getSources(lens(ALL_FORMATS))
    const tournaments = await ds.getTournaments(lens(ALL_FORMATS))
    expect(all.reduce((s, x) => s + x.tournaments, 0)).toBe(tournaments.length)
  })

  it('returns [] for an unknown format', async () => {
    expect(await ds.getTournaments(lens('nope'))).toEqual([])
  })
})

describe('FixtureDataSource.getTournament', () => {
  it('returns null for an unknown id', async () => {
    expect(await ds.getTournament('missing')).toBeNull()
  })

  it('synthesizes deterministic standings with consistent matchups', async () => {
    const [t] = await ds.getTournaments(lens('pauper'))
    const a = await ds.getTournament(t.id)
    const b = await ds.getTournament(t.id)
    expect(a).toEqual(b)
    expect(a!.tournament).toEqual(t)
    expect(a!.standings).toHaveLength(t.entries)
    expect(a!.standings.every(s => isEventId(s.entryId))).toBe(true)

    // Every match is recorded from both sides: total wins == total losses.
    const w = a!.matchups.reduce((s, m) => s + m.wins, 0)
    const l = a!.matchups.reduce((s, m) => s + m.losses, 0)
    expect(w).toBe(l)
    // ...and standings records agree with the matchup totals.
    expect(a!.standings.reduce((s, x) => s + x.wins, 0)).toBe(w)
  })

  it('ranks MTGO events and leaves others unranked', async () => {
    const all = await ds.getTournaments(lens(ALL_FORMATS))
    const mtgo = all.find(t => t.source === 'MTGO')
    const other = all.find(t => t.source !== 'MTGO')
    const m = await ds.getTournament(mtgo!.id)
    expect(m!.standings.map(s => s.rank)).toEqual(
      m!.standings.map((_, i) => i + 1)
    )
    if (other) {
      const o = await ds.getTournament(other.id)
      expect(o!.standings.every(s => s.rank === null)).toBe(true)
    }
  })
})
