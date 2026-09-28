import artMap from '@/datasource/art-map.json'
import type { FormatDTO, FormatSlug } from '@/datasource/types'

// ---------------------------------------------------------------------------
// Naming helpers for rows straight from the `tournament` database: URL slugs,
// display casing, bucket detection, and the signature-card art lookup. Pure.
// ---------------------------------------------------------------------------

/** Duel Commander's short monogram (its names contain MTG 'Name // Name'
 *  forms, so the chip shows 'DC' per the fixture plan). */
const DUEL_COMMANDER = 'duel-commander'

type ArtMapEntry = { cardName: string; artCropUrl: string | null }

/** The repo's canonical archetype slug discipline (params.ts `slugRe`): the
 *  display name lowercased, non-alphanumerics collapsed to one hyphen, no
 *  leading/trailing hyphen. Duel Commander names contain MTG "Name // Name"
 *  and comma forms; the same reduction produces their URL keys. */
export function slugifyArchetype(name: string): string {
  return name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

/** The two classifier fall-through buckets, de-emphasized in every view. */
export function isBucketName(name: string): boolean {
  const n = name.toLowerCase()
  return n === 'unknown' || n === 'conflict'
}

/** Display casing for archetype names straight from the DB (stored lowercase,
 *  e.g. 'broodscale', '5 color aggro', 'red madness'). Title-case per word —
 *  the fixture names are already Title Case, so this makes both backends agree.
 *  A leading digit is preserved ('5 Color Aggro'). Idempotent. */
export function archetypeDisplayName(name: string): string {
  return name
    .split(/\s+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** Short format monogram for chips/labels: 'Duel Commander' → 'DC', else the
 *  capitalized name ('Pauper'). Format rows live in the DB as lowercase slugs
 *  ('pauper'), so every consumer path capitalizes here. */
export function formatDisplayName(name: string): string {
  if (name === DUEL_COMMANDER) return 'DC'
  return archetypeDisplayName(name)
}

/** The long display name for headings: the DB's hyphenated slug title-cased
 *  per word ('duel-commander' → 'Duel Commander', 'pauper' → 'Pauper'). */
export function formatLongName(name: string): string {
  return archetypeDisplayName(name.replace(/-/g, ' '))
}

/** FormatDTO for one DB format row (rows are lowercase slugs). `name` is the
 *  long form pages use for headings, `displayName` the chip monogram — the
 *  two fields the contract distinguishes (types.ts FormatDTO). */
export function formatDto(name: string): FormatDTO {
  return {
    slug: name as FormatSlug,
    name: formatLongName(name),
    displayName: formatDisplayName(name),
  }
}

/** The DTO's art payload for one archetype, or null when the map has no
 *  entry (buckets, brand-new archetypes → the UI's gradient fallback).
 *
 *  The map is generated offline by scripts/gen-archetype-art.ts (most
 *  distinctive card per archetype, see scripts/signature-card.ts, + Scryfall
 *  art_crop), keyed format
 *  name → archetype slug → { cardName, artCropUrl|null }. It is a static
 *  import — no runtime Scryfall calls (§9 contract amendment: only the OG
 *  route stays asset-embedded). */
export function artFor(
  formatName: string,
  archetypeName: string
): ArtMapEntry | null {
  const bySlug =
    (artMap.formats as Record<string, Record<string, ArtMapEntry>>)[
      formatName
    ] ?? null
  if (!bySlug) return null
  return bySlug[slugifyArchetype(archetypeName)] ?? null
}
