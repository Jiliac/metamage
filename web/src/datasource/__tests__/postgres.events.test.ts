import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  eventMatchupDto,
  isHttpUrl,
  isUuid,
  standingDto,
  tournamentDto,
} from '@/datasource/postgres/events'
import type {
  EventMatchupRow,
  StandingRow,
  TournamentRow,
} from '@/datasource/postgres/sql'

// ---------------------------------------------------------------------------
// Event pages on the Postgres backend: the pure row → DTO helpers, then
// PostgresDataSource's id guard and all-formats filter with the SQL module
// mocked (no TOURNAMENT_DATABASE_URL needed).
// ---------------------------------------------------------------------------

const sql = vi.hoisted(() => ({
  TOURNAMENT_SQL: vi.fn(),
  STANDINGS_SQL: vi.fn(),
  EVENT_MATCHUPS_SQL: vi.fn(),
  TOURNAMENTS_SQL: vi.fn(),
  SOURCES_SQL: vi.fn(),
}))
const loaders = vi.hoisted(() => ({ loadFormatId: vi.fn() }))

vi.mock('@/datasource/postgres/client', () => ({ db: () => ({}) }))
vi.mock('@/datasource/postgres/sql', async importOriginal => ({
  ...(await importOriginal<object>()),
  ...sql,
}))
vi.mock('@/datasource/postgres/loaders', async importOriginal => ({
  ...(await importOriginal<object>()),
  ...loaders,
}))

const { PostgresDataSource } = await import('@/datasource/postgres')

const ID = '3f2b8c1a-9d4e-4c7b-a1f2-0b6d5e8a9c10'

const tournamentRow = (over: Partial<TournamentRow> = {}): TournamentRow => ({
  id: ID,
  name: 'Modern Challenge 32',
  date: new Date('2026-10-03T14:00:00Z'),
  format: 'modern',
  source: 'MTGO',
  link: 'https://www.mtgo.com/decklist/modern-challenge-32',
  entries: 32,
  ...over,
})

const standingRow = (over: Partial<StandingRow> = {}): StandingRow => ({
  entry_id: 'e1',
  rank: 1,
  wins: 6,
  losses: 1,
  draws: 0,
  decklist_url: null,
  player: 'alice',
  archetype: 'Boros Energy',
  color: 'RW',
  has_cards: true,
  ...over,
})

describe('isUuid', () => {
  it('accepts UUIDs in either case', () => {
    expect(isUuid(ID)).toBe(true)
    expect(isUuid(ID.toUpperCase())).toBe(true)
  })

  it('rejects fixture ids, junk and padded UUIDs', () => {
    expect(isUuid('modern-2026-05-01-mtgo-17')).toBe(false)
    expect(isUuid('abc')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(`${ID}-x`)).toBe(false)
  })
})

describe('isHttpUrl', () => {
  it('passes http(s) only', () => {
    expect(isHttpUrl('https://melee.gg/x')).toBe(true)
    expect(isHttpUrl('HTTP://example.com')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('//evil.example')).toBe(false)
    expect(isHttpUrl(null)).toBe(false)
  })
})

describe('tournamentDto', () => {
  it('maps the header row with an ISO day and the format slug', () => {
    expect(tournamentDto(tournamentRow())).toEqual({
      id: ID,
      name: 'Modern Challenge 32',
      date: '2026-10-03',
      format: 'modern',
      source: 'MTGO',
      link: 'https://www.mtgo.com/decklist/modern-challenge-32',
      entries: 32,
    })
  })

  it('drops non-http links', () => {
    expect(
      tournamentDto(tournamentRow({ link: 'javascript:alert(1)' }))
    ).not.toHaveProperty('link')
    expect(tournamentDto(tournamentRow({ link: null }))).not.toHaveProperty(
      'link'
    )
  })
})

describe('standingDto', () => {
  it('maps a ranked entry with a slugged, display-cased archetype', () => {
    expect(standingDto(standingRow())).toEqual({
      entryId: 'e1',
      rank: 1,
      wins: 6,
      losses: 1,
      draws: 0,
      player: 'alice',
      archetype: {
        slug: 'boros-energy',
        name: 'Boros Energy',
        color: 'RW',
        isBucket: false,
      },
      hasDecklist: true,
    })
  })

  it('turns the 0 "no placing" sentinel into null', () => {
    expect(standingDto(standingRow({ rank: 0 })).rank).toBeNull()
  })

  it('flags the classifier buckets', () => {
    expect(
      standingDto(standingRow({ archetype: 'Unknown' })).archetype.isBucket
    ).toBe(true)
  })

  it('keeps http(s) decklist urls only', () => {
    const url = 'https://melee.gg/Decklist/View/1'
    expect(standingDto(standingRow({ decklist_url: url })).decklistUrl).toBe(
      url
    )
    expect(
      standingDto(standingRow({ decklist_url: 'data:text/html,x' }))
    ).not.toHaveProperty('decklistUrl')
  })
})

describe('eventMatchupDto', () => {
  it('slugs both archetype names', () => {
    const row: EventMatchupRow = {
      row_name: 'Boros Energy',
      col_name: 'Dimir Murktide',
      wins: 2,
      losses: 1,
      draws: 0,
    }
    expect(eventMatchupDto(row)).toEqual({
      rowSlug: 'boros-energy',
      colSlug: 'dimir-murktide',
      wins: 2,
      losses: 1,
      draws: 0,
    })
  })
})

describe('PostgresDataSource events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for a non-UUID id without querying', async () => {
    const ds = new PostgresDataSource()
    expect(await ds.getTournament('not-a-uuid')).toBeNull()
    expect(sql.TOURNAMENT_SQL).not.toHaveBeenCalled()
  })

  it('returns null when no event has the id', async () => {
    sql.TOURNAMENT_SQL.mockResolvedValue([])
    const ds = new PostgresDataSource()
    expect(await ds.getTournament(ID)).toBeNull()
    expect(sql.STANDINGS_SQL).not.toHaveBeenCalled()
  })

  it('assembles header, standings and matchups for a known event', async () => {
    sql.TOURNAMENT_SQL.mockResolvedValue([tournamentRow()])
    sql.STANDINGS_SQL.mockResolvedValue([standingRow()])
    sql.EVENT_MATCHUPS_SQL.mockResolvedValue([])
    const detail = await new PostgresDataSource().getTournament(ID)
    expect(detail?.tournament.id).toBe(ID)
    expect(detail?.standings.map(s => s.entryId)).toEqual(['e1'])
    expect(detail?.matchups).toEqual([])
  })

  const query = {
    start: '2026-09-01',
    end: '2026-09-30',
  } as const

  it('lists every format with a null format filter for `all`', async () => {
    sql.TOURNAMENTS_SQL.mockResolvedValue([tournamentRow()])
    sql.SOURCES_SQL.mockResolvedValue([])
    const ds = new PostgresDataSource()
    const q = { ...query, format: 'all' } as never
    expect(await ds.getTournaments(q)).toHaveLength(1)
    await ds.getSources(q)
    expect(sql.TOURNAMENTS_SQL).toHaveBeenCalledWith(
      null,
      query.start,
      query.end
    )
    expect(sql.SOURCES_SQL).toHaveBeenCalledWith(null, query.start, query.end)
    expect(loaders.loadFormatId).not.toHaveBeenCalled()
  })

  it('returns nothing for an unknown format', async () => {
    loaders.loadFormatId.mockResolvedValue([])
    const ds = new PostgresDataSource()
    const q = { ...query, format: 'nope' } as never
    expect(await ds.getTournaments(q)).toEqual([])
    expect(await ds.getSources(q)).toEqual([])
    expect(sql.TOURNAMENTS_SQL).not.toHaveBeenCalled()
  })

  it('filters by the resolved format id', async () => {
    loaders.loadFormatId.mockResolvedValue([{ id: 'fmt-1' }])
    sql.TOURNAMENTS_SQL.mockResolvedValue([])
    const q = { ...query, format: 'modern' } as never
    await new PostgresDataSource().getTournaments(q)
    expect(sql.TOURNAMENTS_SQL).toHaveBeenCalledWith(
      'fmt-1',
      query.start,
      query.end
    )
  })
})
