import type { Platform, TournamentDTO } from '@/datasource/types'

// ---------------------------------------------------------------------------
// Platform = where an event was played, derived from its source. Magic Online
// is the only online source we ingest; Melee, CardsRealm and the catch-all
// OTHER publish tabletop events. One definition so the SQL predicate, the
// fixture filter and the UI labels can never disagree.
// ---------------------------------------------------------------------------

export const ONLINE_SOURCES: readonly TournamentDTO['source'][] = ['MTGO']

export const PLATFORMS: readonly Platform[] = ['all', 'online', 'paper']

export const PLATFORM_LABELS: Record<Platform, string> = {
  all: 'All',
  online: 'Online',
  paper: 'Paper',
}

/** True when an event from `source` belongs in the `platform` lens. */
export function matchesPlatform(
  source: TournamentDTO['source'],
  platform: Platform
): boolean {
  if (platform === 'all') return true
  const online = ONLINE_SOURCES.includes(source)
  return platform === 'online' ? online : !online
}

/** ' · Online only' / ' · Paper only', or '' for all — appended to the
 *  eyebrows that name the window, so a filtered view says so. */
export function platformScope(platform: Platform): string {
  return platform === 'all' ? '' : ` · ${PLATFORM_LABELS[platform]} only`
}
