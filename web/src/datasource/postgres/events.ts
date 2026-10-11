import type {
  ArchetypeSlug,
  EventMatchupDTO,
  FormatSlug,
  StandingDTO,
  TournamentDTO,
} from '@/datasource/types'
import {
  archetypeDisplayName,
  asIso,
  isBucketName,
  slugifyArchetype,
} from '@/datasource/postgres/naming'
import type {
  EventMatchupRow,
  StandingRow,
  TournamentRow,
} from '@/datasource/postgres/sql'

// ---------------------------------------------------------------------------
// Event (single-tournament) row → DTO mapping for PostgresDataSource, plus the
// id guard that keeps non-UUID ids away from the `uuid` columns. Pure; never
// touches the DB client.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `tournaments.id` is a `uuid` column: any other string makes Postgres throw
 *  (22P02) instead of matching nothing, so callers treat it as "not found". */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id)
}

/** Source links are rendered as hrefs; only pass through http(s) URLs. */
export function isHttpUrl(url: string | null): url is string {
  return url !== null && /^https?:\/\//i.test(url)
}

const asSlug = (s: string) => slugifyArchetype(s) as ArchetypeSlug

export function tournamentDto(t: TournamentRow): TournamentDTO {
  return {
    id: t.id,
    name: t.name,
    date: asIso(t.date),
    format: t.format as FormatSlug,
    source: t.source as TournamentDTO['source'],
    ...(isHttpUrl(t.link) ? { link: t.link } : {}),
    entries: t.entries,
  }
}

export function standingDto(r: StandingRow): StandingDTO {
  return {
    entryId: r.entry_id,
    // 0 (or NULL) is the ingest's "no placing" sentinel (Melee, leagues).
    rank: r.rank > 0 ? r.rank : null,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    player: r.player,
    archetype: {
      slug: asSlug(r.archetype),
      name: archetypeDisplayName(r.archetype),
      color: r.color ?? null,
      isBucket: isBucketName(r.archetype),
    },
    ...(isHttpUrl(r.decklist_url) ? { decklistUrl: r.decklist_url } : {}),
    hasDecklist: r.has_cards,
  }
}

export function eventMatchupDto(m: EventMatchupRow): EventMatchupDTO {
  return {
    rowSlug: asSlug(m.row_name),
    colSlug: asSlug(m.col_name),
    wins: m.wins,
    losses: m.losses,
    draws: m.draws,
  }
}
