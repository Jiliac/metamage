/*
 * gen-fixtures.ts — seeded, deterministic fixture generator (blueprint §5).
 *
 * Emits RAW per-archetype (per-player W/L/D, for clustering) and per-matchup
 * (per unordered pair W/L/D) counts as ONE typed JSON DB at
 * src/datasource/fixtures/data/db.jsonl (compact JSONL, a few hundred lines;
 * see src/datasource/fixtures-jsonl.ts). It imports the raw schema types from the
 * data source, so a fixture that drifts from the contract fails `tsc`. No
 * derived stats are stored — FixtureDataSource computes every rate/CI/tier via
 * @/lib/stats at read time, so the fixture and Postgres backends can never
 * disagree. Signature-card art_crop URLs are fetched from Scryfall AT GENERATION
 * TIME (network here is fine; never at runtime) with a graceful null fallback.
 * KTD12: the DB also carries synthetic recent-deck entries (up to 8 per
 * archetype-window, deterministic UUID ids) with decklists sampled from the
 * adoption pools, plus a global `cardData` map resolved once per name via
 * POST /cards/collection — any `not_found` aborts the run.
 *
 * This file is the entry point; the builders live in scripts/gen-fixtures/
 * (formats, windows, archetypes, cards, decks, scryfall) and the per-format
 * seed data in gen-fixtures.specs.ts.
 *
 * Run: pnpm gen:fixtures    (then: pnpm test && pnpm exec tsc --noEmit)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RawDb } from '../src/datasource/fixtures'
import {
  FIXTURE_MAX_LINES,
  encodeDbJsonl,
} from '../src/datasource/fixtures-jsonl'
import { buildFormats } from './gen-fixtures/formats'
import {
  buildStandardArt,
  collectCardNames,
  fetchCardData,
} from './gen-fixtures/scryfall'

// A frozen timestamp so the committed DB (and its snapshot test) is stable.
const GENERATED_AT = '2026-07-05T00:00:00.000Z'

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function writeDb(dbOut: RawDb): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const outDir = join(here, '..', 'src', 'datasource', 'fixtures', 'data')
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, 'db.jsonl')
  const text = encodeDbJsonl(dbOut)
  const lineCount = text.split('\n').length - 1
  if (lineCount > FIXTURE_MAX_LINES) {
    throw new Error(
      `fixture DB is ${lineCount} lines, over the ${FIXTURE_MAX_LINES}-line cap`
    )
  }
  writeFileSync(outFile, text, 'utf8')

  const formats = dbOut.formats
  const totalWindows = formats.reduce((s, f) => s + f.windows.length, 0)
  process.stdout.write(
    `Wrote ${outFile}\n  ${formats.length} formats, ${totalWindows} windows, ${lineCount} lines\n`
  )
}

async function main(): Promise<void> {
  process.stdout.write(
    'Fetching Standard signature-card art from Scryfall...\n'
  )
  const standardArt = await buildStandardArt()

  const formats = buildFormats(standardArt)

  // KTD12: resolve the KTD1 card data for every fixture card name once, then
  // embed it in the DB so the runtime fixture backend never calls Scryfall.
  const cardNames = collectCardNames(formats)
  process.stdout.write(
    `Resolving ${cardNames.length} fixture cards via Scryfall /cards/collection...\n`
  )
  const cardData = await fetchCardData(cardNames)

  writeDb({ generatedAt: GENERATED_AT, cardData, formats })
}

main().catch(err => {
  process.stderr.write(String(err) + '\n')
  process.exit(1)
})
