# MetaMage — Web Explorer

A self-serve Magic: The Gathering tournament metagame explorer: presence, win
rates, tiers, and the matchup matrix — sliced by format and an analytic "lens"
(time window + knobs) that lives entirely in the URL, so every view is a
bookmarkable, shareable, OG-previewable, ISR-cacheable link.

This is the **route skeleton** milestone: every route stands up end-to-end
against committed fixture data behind a typed data-access layer, so a real Neon
Postgres backend can swap in later without touching a single page.

- **Architecture blueprint:** [`../docs/plans/2026-07-04-web-explorer-skeleton.md`](../docs/plans/2026-07-04-web-explorer-skeleton.md)
  (§2 URL scheme, §3 data contract, §6 component tree, §7 build order).
- **Visual source of truth:** [`../docs/plans/2026-07-04-design-spike-gathering-ledger.html`](../docs/plans/2026-07-04-design-spike-gathering-ledger.html)
  — "The Gathering Ledger · Arena Bronze". Tokens + component treatments in §9 of
  the blueprint. The site is styled to the spike, not stock shadcn.

---

## Quick start

```bash
pnpm install
cp .env.example .env.local   # optional — the app runs on fixtures with no env
pnpm dev                     # http://localhost:3000 → redirects to /meta/standard
```

No database, no API keys, no external services are required in development: the
committed fixture DB (`src/datasource/fixtures/data/db.json`) is the default
backend.

## Scripts

| Script              | What it does                                                                          |
| ------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`          | Next dev server (Turbopack).                                                          |
| `pnpm build`        | Production build. Prebuilds the default-window pages per format.                      |
| `pnpm start`        | Serve the production build.                                                           |
| `pnpm lint`         | ESLint (next + prettier).                                                             |
| `pnpm format`       | Prettier write. `pnpm format:check` to verify.                                        |
| `pnpm test`         | Vitest — the `stats.ts` unit + fixture snapshot-parity suite.                         |
| `pnpm gen:fixtures` | Regenerate `db.json` (seeded, deterministic; fetches Scryfall art crops at gen time). |

## Environment

See [`.env.example`](./.env.example). All vars are optional in dev.

- `DATA_SOURCE` — `fixtures` (default) or `postgres` (deferred; falls back to fixtures).
- `NEXT_PUBLIC_SITE_URL` — absolute origin; drives canonical URLs, OG image URLs, robots + sitemap. Defaults to `http://localhost:3000`.
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` — analytics; no-op when the key is blank.

---

## Architecture

**Stack.** Next.js 15 (app router, React 19), TypeScript strict, Tailwind v4
CSS-first (`@theme` + oklch tokens in `globals.css`, no `tailwind.config.js`),
shadcn/Radix primitives, next-themes, PostHog, Recharts (2D charts only),
TanStack Table.

### The URL is the state

There is no client store for view state. `src/lib/params.ts` is the only place
that (de)serializes the lens:

- `parseMetaQuery(format, searchParams)` → a validated, defaulted `MetaQuery`
  (usable in RSC and client).
- `buildHref(format, query, opts)` → the canonical URL, omitting defaults.

Because both are pure, **canonical URL == shareable URL == OG URL == ISR cache
key**. `useMetaParams()` (client) wraps these and funnels every change through
one `setParams()` that pushes the new href and fires the `reparameterize`
PostHog capture.

Routes (format is a **path segment**; the lens is **query params**):

| Path                              | View                                                                |
| --------------------------------- | ------------------------------------------------------------------- |
| `/`                               | → redirects to `/meta/standard`                                     |
| `/meta/[format]`                  | Meta overview: KPIs, deck tiles, ranked table, scatter, matrix hero |
| `/meta/[format]/archetype/[slug]` | Archetype detail — `?tab=` decklists/matchups/trends/performance    |
| `/meta/[format]/matrix`           | The full N×N matchup matrix (extra `?n`/`?min`)                     |
| `/meta/[format]/changes`          | Bans / set-release timeline                                         |
| `/meta/[format]/tournaments`      | Events + source breakdown for the window                            |

`[slug]` is always a stable canonical slug; `resolveSlug()` 307-redirects stale/
renamed slugs and 404s unknown ones.

### The data-access firewall

Pages import **only** `getDataSource()` (`src/datasource/index.ts`) — never a DB
client. It returns a singleton implementing the typed `MetaDataSource` interface
(`src/datasource/types.ts`, the frozen contract), wrapped so every read is
memoized by `unstable_cache` keyed on the method + serialized query (ISR-style
memo for the long tail of windows/knobs).

```
page.tsx ─► getDataSource() ─► withCache() ─► FixtureDataSource ─► db.json
                                                    │
                                                    └─ derives every stat via src/lib/stats.ts
```

All derived math (both WR formulas, Wilson + cluster-robust CI, tier bands,
matrix reliability/CI/lowN, presenceRank) lives in **one module**,
`src/lib/stats.ts`, called by the fixtures backend now and the Postgres backend
later — so the two can never disagree. A snapshot test guards it.

### Swapping in Postgres (the deferred read-path)

The whole point of the firewall: when Neon lands, you add **one file** —
`src/datasource/postgres.ts` implementing `MetaDataSource`, reusing
`src/lib/stats.ts` for post-query fields — wire it into the `postgres` case of
`createRawDataSource()` in `src/datasource/index.ts`, and flip
`DATA_SOURCE=postgres`. No page, component, cache wrapper, or URL changes.
Fixtures remain the test / OG / dev backend.

### Rendering & caching

- `generateStaticParams` prebuilds the default-window landing, matrix, changes,
  tournaments per format, plus the top-N archetype detail pages. `dynamicParams`
  keeps the long tail on-demand.
- `export const revalidate` per route (hourly for windowed data, daily for
  format-level bans/formats).
- Non-default lenses render on demand and hit the `unstable_cache` memo.
- Charts are `'use client'` progressive enhancement; the server-rendered table +
  next/og card carry SEO/share. OG is a `/og` route handler (reads the full lens
  from `searchParams`, hand-drawn with next/og divs, zero remote fetches).

### Directory map

```
src/
  app/                      routes (layout, /, /meta/[format]/**, /og, sitemap, robots)
  components/
    charts/                 MatchupMatrix (hand-built grid), scatter/trend (Recharts), CI/tier/presence
    tables/                 MetaTable (TanStack), CardAdoptionTable
    LensBar/                FormatPicker, WindowPicker, KnobsPopover, ArchetypeAdder
    ui/                     shadcn/Radix primitives
    ManaPips, ArtCrop, DeckTile, KpiStat, EmptyState, Navbar, ShareButton, …
  datasource/
    types.ts                the frozen MetaDataSource contract + DTOs
    index.ts                getDataSource() singleton + unstable_cache layer
    fixtures.ts             FixtureDataSource (selection pipeline in TS)
    fixtures/data/db.json   committed seeded fixture DB
  hooks/useMetaParams.ts    the single lens read/write choke point
  lib/
    params.ts               parseMetaQuery / buildHref (URL ⇄ state)
    stats.ts                all derived math (shared by every backend)
    seo.ts                  buildPageMetadata (canonical + OG)
    analytics.ts            typed PostHog capture()
scripts/gen-fixtures.ts     deterministic fixture generator
```
