import type {
  RawArchetype,
  RawCardData,
  RawDb,
  RawFormat,
  RawWindow,
} from './fixtures'

// ---------------------------------------------------------------------------
// JSONL codec for the committed fixture DB. One compact JSON record per line,
// split coarsely (meta, one line per card, per format, per window, per
// archetype-window) so the file stays a few hundred lines and diffs stay
// line-local. Pure — no fs — so the generator (tsx) and the runtime loader
// share it. Relative imports only: the generator does not resolve `@/`.
// ---------------------------------------------------------------------------

/** Hard ceiling on the committed fixture's line count. */
export const FIXTURE_MAX_LINES = 1000

type MetaLine = { kind: 'meta'; generatedAt: string }
type CardLine = { kind: 'card'; name: string; value: RawCardData }
type FormatLine = { kind: 'format'; value: Omit<RawFormat, 'windows'> }
type WindowLine = {
  kind: 'window'
  format: string
  value: Omit<RawWindow, 'archetypes'>
}
type ArchetypeLine = {
  kind: 'archetype'
  format: string
  start: string
  end: string
  value: RawArchetype
}

type Line = MetaLine | CardLine | FormatLine | WindowLine | ArchetypeLine

/** RawDb → JSONL text (trailing newline). Record order follows the DB order,
 *  so the decode is an exact round trip. */
export function encodeDbJsonl(db: RawDb): string {
  const lines: Line[] = [{ kind: 'meta', generatedAt: db.generatedAt }]
  for (const [name, value] of Object.entries(db.cardData)) {
    lines.push({ kind: 'card', name, value })
  }
  for (const { windows, ...format } of db.formats) {
    lines.push({ kind: 'format', value: format })
    for (const { archetypes, ...win } of windows) {
      lines.push({ kind: 'window', format: format.slug, value: win })
      for (const arch of archetypes) {
        lines.push({
          kind: 'archetype',
          format: format.slug,
          start: win.start,
          end: win.end,
          value: arch,
        })
      }
    }
  }
  return lines.map(l => JSON.stringify(l)).join('\n') + '\n'
}

/** JSONL text → RawDb. Windows and archetypes attach to the most recent
 *  format/window line, which must match their keys; an orphan record means a
 *  corrupt fixture. */
export function decodeDbJsonl(text: string): RawDb {
  const db: RawDb = { generatedAt: '', cardData: {}, formats: [] }
  let format: RawFormat | null = null
  let win: RawWindow | null = null
  for (const raw of text.split('\n')) {
    if (!raw) continue
    const line = JSON.parse(raw) as Line
    switch (line.kind) {
      case 'meta':
        db.generatedAt = line.generatedAt
        break
      case 'card':
        db.cardData[line.name] = line.value
        break
      case 'format':
        format = { ...line.value, windows: [] }
        db.formats.push(format)
        win = null
        break
      case 'window':
        if (!format || format.slug !== line.format) {
          throw new Error(
            `[fixtures] window line for unknown format '${line.format}'`
          )
        }
        win = { ...line.value, archetypes: [] }
        format.windows.push(win)
        break
      case 'archetype':
        if (
          !win ||
          format?.slug !== line.format ||
          win.start !== line.start ||
          win.end !== line.end
        ) {
          throw new Error(
            `[fixtures] archetype line for unknown window ${line.format} ${line.start}_${line.end}`
          )
        }
        win.archetypes.push(line.value)
        break
      default:
        throw new Error(`[fixtures] unknown record kind in ${raw.slice(0, 80)}`)
    }
  }
  return db
}
