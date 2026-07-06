# MetaMage Web Explorer — Skeleton Blueprint

> Synthesized from two independent architecture proposals (IA-first "A" and contract-first "B").
> Date: 2026-07-04. Target: brand-new app at `/Users/valentin/Development/magic/metamage/web/`.
> Milestone: **full route skeleton on fixture data**. Settle IA + URL scheme + data contract; do
> not make any single view rich yet.

---

## 1. Goal & constraints

**Goal.** Stand up every route of the self-serve metagame explorer (meta overview, archetype
detail, matchup matrix, plus supporting changes/tournaments views) end-to-end against fixture data,
behind a typed data-access layer, so real Neon Postgres swaps in later without touching pages.

**Hard constraints (owner + repo).**

- pnpm, TypeScript **strict**, Next.js 15 app router, React 19. Deploy on its own subdomain.
- Tailwind **v4 CSS-first** (`@theme inline` + oklch tokens in `globals.css`); **NO** `tailwind.config.js`.
- shadcn new-york / slate / lucide, cssVariables. Copy legacy `ui/*` primitives + `cn()` verbatim.
- Config carryover from legacy `ui/`: `eslint.config.mjs`, `.prettierrc`, `postcss.config.mjs`,
  `tsconfig.json`, `components.json`, `globals.css`, layout metadata scaffold, brand assets.
- **Never** import a DB client / Prisma / the Ops DB in pages. The tournament DB is mid-migration by
  another agent; the read-path is deferred. Fixtures behind an interface are the firewall.
- URL is the single source of truth for view state (deep-link / bookmark / ISR / OG all key off it).
- PostHog: wire the `reparameterize` capture at the choke point from day one.

**Non-goals for this milestone.** Rich/polished individual views, real card art, the eventual
Postgres SQL bodies, `/compare`, auth, write paths. Keep charts placeholder-simple.

**Load-bearing decisions (get these right, they outlive the skeleton).** The URL scheme and the data
contract. Everything else is disposable skeleton scaffolding.

---

## 2. URL scheme & routes

### Decision: format is a **path segment**, the analytic lens is **query params**

Adopt Design A's nested scheme over Design B's flat `?format=` scheme. Format is the stable,
canonical partition key of the whole product — it belongs in the path for SEO, clean canonical URLs,
sitemap enumeration, and per-format SSG. The lens (window + knobs) is high-cardinality and
combinatorial, so it lives in query params.

**One canonical time representation: explicit `start` + `end` ISO dates.** Reject Design B's parallel
`window=2026-06` monthly-key param — two representations of the same axis invites drift and
inconsistent canonical URLs. Presets ("last month", "Q1") are UI sugar that expand to `start`/`end`
at the input edge and are never stored. Prebuildability is detected by comparing the resolved
window against the format's current-month default, not by a magic param.

### Shared params (parsed + validated once by `parseMetaQuery`, zod-backed)

| Param     | Meaning                                     | Default              |
| --------- | ------------------------------------------- | -------------------- |
| `start`   | ISO `YYYY-MM-DD`, inclusive                 | first of curr. month |
| `end`     | ISO `YYYY-MM-DD`, inclusive                 | last of curr. month  |
| `top`     | topN for presence/WR/tier/scatter           | `20`                 |
| `n`       | matrixTopN (matrix route only)              | `12`                 |
| `min`     | minMatches (matrix) / minEntries (else)     | `80`                 |
| `add`     | comma-joined slugs to force-include         | `[]`                 |
| `buckets` | `hide` \| `show` unknown/conflict           | `hide`               |
| `weight`  | `match` \| `entry` presence weighting       | `match`              |
| `sort`    | table sort key (`presence`\|`wrlo`\|`tier`) | `presence`           |

`buildHref(format, MetaQuery)` is the inverse serializer; it **omits defaults** for clean URLs.
Canonical URL == shareable URL == OG URL == ISR cache key — all derived from the same pair of pure
functions in `src/lib/params.ts`.

### Routes

| Path                              | View                                                                                                                                                                                                       | Rendering mode                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                               | Format resolver → redirect to `/meta/pauper` (default format)                                                                                                                                              | SSG                                                                                                                                                     |
| `/meta/[format]`                  | **Meta overview landing.** KPI tiles (tournaments/entries/matches), sortable MetaTable (presence% + WR + tier column, rows link to detail), presence bars, WR-vs-presence scatter, WR-CI chart, tier chart | `generateStaticParams` per format @ default window, `dynamicParams=true`, `revalidate=3600`; non-default searchParams → dynamic, memoized by data layer |
| `/meta/[format]/archetype/[slug]` | **Archetype detail.** Radix tabs via `?tab=`: decklists (MAIN/SIDE adoption), matchups (this row vs all, CI), trends (weekly presence%+WR), performance (tier/WR-CI)                                       | `generateStaticParams` prebuilds top-N archetypes per format @ default window; long tail dynamic                                                        |
| `/meta/[format]/matrix`           | **Matchup matrix (the moat).** N×N grid, extra params `n`/`min`. Its own OG card                                                                                                                           | SSG default window per format; dynamic otherwise                                                                                                        |
| `/meta/[format]/changes`          | Bans / set-releases timeline (annotates windows)                                                                                                                                                           | SSG per format, `revalidate` daily                                                                                                                      |
| `/meta/[format]/tournaments`      | Events + source breakdown for the window                                                                                                                                                                   | Dynamic + cached                                                                                                                                        |

`[slug]` is a **stable canonical slug**, never a mutable display name (pitfall #7). The data layer
owns the slug↔display map and `resolveSlug()` returns a redirect target for renamed/stale slugs.

### OpenGraph

Adopt Design A's **route handler** over Design B's `opengraph-image.tsx` convention. This is a
correctness call: the file-based `opengraph-image` convention receives only path `params`, **not**
`searchParams` — so it cannot see the window/knobs that define the shared state. A dedicated
`app/og/route.tsx` (next/og `ImageResponse`) reads the full lens from `searchParams` and renders
`view=meta|archetype|matrix` cards. `generateMetadata` on each page points `openGraph.images` at
`/og?view=…&format=…&start=…&end=…`. OG art is hand-drawn with next/og div primitives (no Recharts,
no remote Scryfall art — strict-CSP safe); `logo.png` embedded as fallback. Place it at `/og` (not
`/api/og`) so `robots.ts` can keep disallowing `/api/` for data endpoints without blocking previews.

---

## 3. Data contract

Single typed interface `MetaDataSource`; concrete `FixtureDataSource` now, `PostgresDataSource`
later. Pages import **only** `getDataSource()`. Method vocabulary mirrors the MCP tool surface 1:1 so
the eventual Postgres bodies map straight onto the existing `src/analysis/*` SQL.

Adopt Design A's **single `MetaQuery` object** passed to each method (one parse per page) but fold in
Design B's stronger DTO fields: both WR formulas, explicit `ciMethod` badge, both presence weightings
(`matches` vs `decks`), and `isBucket`.

### `src/datasource/types.ts`

```ts
// ---- Branded primitives (cheap safety on the load-bearing keys) ----
export type FormatSlug = string & { readonly __brand: "FormatSlug" };
export type ArchetypeSlug = string & { readonly __brand: "ArchetypeSlug" };
export type IsoDate = string & { readonly __brand: "IsoDate" }; // 'YYYY-MM-DD'

// ---- The lens: single source of truth, parsed from searchParams ----
export type MetaQuery = {
  format: FormatSlug;
  start: IsoDate;
  end: IsoDate; // inclusive both ends, matches t.date filter
  topN: number; // default 20
  minMatches: number; // default 80
  includeArchetypes: ArchetypeSlug[]; // forced-in small archetypes
  hideBuckets: boolean; // drop unknown/conflict
  weight: "match" | "entry"; // presence weighting
};

export type FormatDTO = {
  slug: FormatSlug;
  name: string; // display, e.g. 'Duel Commander'
  displayName: string; // 'DC' for duel-commander, else name
};

export type WindowKpisDTO = {
  tournaments: number;
  entries: number;
  matches: number;
};

export type CiMethod = "clustered" | "wilson" | "binomial";

// The canonical archetype row: presence ⋈ wr ⋈ players ⋈ tier.
export type ArchetypeRowDTO = {
  slug: ArchetypeSlug;
  name: string;
  color: string | null; // guild code e.g. 'BR', part of name too
  // presence — MATCH-weighted by default; both counts exposed
  matches: number; // COUNT(matches)
  decks: number; // COUNT(DISTINCT entry_id)
  share: number; // 0..1, full-meta denom, pre-filter
  presenceRank: number; // 1 = most played (numbered-dot index)
  // record
  wins: number;
  losses: number;
  draws: number;
  games: number; // W+L+D
  points: number; // W + 0.5D
  // two WR formulas — expose both, never pick silently
  wr: number; // CANONICAL (charts): (W+0.5D)/games
  wrExclDraws: number; // (marav): W/(W+L)
  // confidence
  wrLo: number;
  wrHi: number; // 95% CI, clamped [0,1]
  ciMethod: CiMethod; // so UI can badge low-confidence rows
  players: number; // COUNT(DISTINCT player_id)
  // ranking
  tier: 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | null; // std-dev bands over wrLo
  isBucket: boolean; // true for unknown/conflict → de-emphasize
};

export type MetaReportDTO = {
  window: { start: IsoDate; end: IsoDate };
  kpis: WindowKpisDTO;
  rows: ArchetypeRowDTO[]; // sorted by MetaQuery.sort
  other: { share: number; matches: number } | null; // collapsed tail
  generatedAt: string;
};

export type MatchupCellDTO = {
  rowSlug: ArchetypeSlug;
  colSlug: ArchetypeSlug;
  rowName: string;
  colName: string;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  wr: number; // row-vs-col (W+0.5D)/games
  ciLow: number;
  ciHigh: number;
  reliability: number; // min(1, games/50)
  lowN: boolean; // games < 5 → render '–'
  ciCrosses50: boolean;
  isMirror: boolean; // row==col → blanked
};

export type MatrixOrderEntryDTO = {
  slug: ArchetypeSlug;
  name: string;
  color: string | null;
  globalWr: number | null; // vs whole meta (left WINRATE column)
  share: number;
  matches: number;
};

export type MatrixDTO = {
  window: { start: IsoDate; end: IsoDate };
  order: MatrixOrderEntryDTO[];
  cells: MatchupCellDTO[]; // FULL grid: missing pairs zero-filled, mirrors present
};

export type CardAdoptionDTO = {
  cardId: string;
  name: string; // lowercase in DB — title-case at render
  board: "MAIN" | "SIDE";
  avgCount: number;
  decksPlaying: number;
  presencePct: number;
};

export type TrendPointDTO = {
  weekStart: IsoDate;
  presencePct: number;
  wr: number | null; // null on zero-game weeks (gap)
  games: number;
};

export type ArchetypeDetailDTO = {
  archetype: { slug: ArchetypeSlug; name: string; color: string | null };
  window: { start: IsoDate; end: IsoDate };
  kpis: WindowKpisDTO;
  summary: ArchetypeRowDTO;
  mainCards: CardAdoptionDTO[];
  sideCards: CardAdoptionDTO[];
  matchups: MatchupCellDTO[]; // this archetype's row vs all
  trends: TrendPointDTO[];
};

export type MetaChangeDTO = {
  date: IsoDate;
  type: "BAN" | "SET_RELEASE";
  description: string;
  setCode?: string;
};

export type TournamentDTO = {
  id: string;
  name: string;
  date: IsoDate;
  source: "MTGO" | "MELEE" | "CARDSREALM" | "OTHER";
  link?: string;
  entries: number;
};

export type SourceDTO = {
  source: TournamentDTO["source"];
  tournaments: number;
  entries: number;
};

export type ArchetypeRef = { slug: ArchetypeSlug; name: string };
```

### `MetaDataSource` interface

```ts
export interface MetaDataSource {
  listFormats(): Promise<FormatDTO[]>;
  getMetaReport(q: MetaQuery): Promise<MetaReportDTO>;
  getArchetypeDetail(
    q: MetaQuery & { slug: ArchetypeSlug },
  ): Promise<ArchetypeDetailDTO | null>;
  getArchetypeCards(
    q: MetaQuery & { slug: ArchetypeSlug; board: "MAIN" | "SIDE" },
  ): Promise<CardAdoptionDTO[]>;
  getArchetypeTrends(
    q: MetaQuery & { slug: ArchetypeSlug },
  ): Promise<TrendPointDTO[]>;
  getMatchupMatrix(q: MetaQuery & { matrixTopN: number }): Promise<MatrixDTO>;
  getMatchup(
    q: MetaQuery & { a: ArchetypeSlug; b: ArchetypeSlug },
  ): Promise<MatchupCellDTO | null>;
  getFormatMetaChanges(format: FormatSlug): Promise<MetaChangeDTO[]>;
  getTournaments(q: MetaQuery): Promise<TournamentDTO[]>;
  getSources(q: MetaQuery): Promise<SourceDTO[]>;
  // slug discipline + small-archetype adder
  searchArchetypes(format: FormatSlug, query: string): Promise<ArchetypeRef[]>;
  resolveSlug(
    format: FormatSlug,
    slug: ArchetypeSlug,
  ): Promise<ArchetypeRef | null>;
}
```

`src/datasource/index.ts` exports `getDataSource()` — a singleton chosen by `DATA_SOURCE`
(`fixtures` | `postgres`, default `fixtures`).

### One math module, two backends (anti-drift)

Adopt Design A's rule: all derived stats (both WR formulas, Wilson + cluster-robust CI, tier bands,
matrix reliability/CI/lowN, presenceRank) live in **`src/lib/stats.ts`** and are called by BOTH the
fixture generator AND (later) the Postgres layer for post-query fields. The two backends can never
disagree on CI/tier math. A snapshot test on the seeded fixtures guards against silent changes.

**Documented canonical choices** (both formulas/CIs are carried, but rankings pick one):

- Ranking key = **`wrLo` from the clustered CI** (the moat). `wr` (half-draw) is the display WR.
- Presence default = **match-weighted** (`weight='match'`); `weight='entry'` switches to `decks`.
- Buckets (`unknown`/`conflict`) default **hidden**; never counted in tier math.

---

## 4. Chart components & tech choice

**Consensus across both designs, refined:** hand-build the matrix; use a chart lib only where the
encoding is genuinely 2D cartesian; hand-roll the trivial 1D charts. This minimizes runtime deps
(good for strict-CSP subdomain) and avoids fighting a monolith on every bespoke encoding.

| Component                 | Tech                           | Why                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MatchupMatrix`           | **Hand-built CSS grid + divs** | A cell is a composite (diverging fill + white confidence-alpha overlay + 3 stacked text rows + low-n '–' + mirror blank + link). No lib models this cleanly; grid is fully SSR-able, accessible, deep-linkable, themeable. This is the moat — own the DOM. Radix tooltips. |
| `WrPresenceScatter`       | **Recharts** `ScatterChart`    | Genuinely 2D (sqrt-x share vs y WR), numbered dots via custom `shape`, plain `<ol>` side legend.                                                                                                                                                                           |
| `TrendChart`              | **Recharts** dual-line         | 2D time series, `ReferenceLine` for ban/set markers.                                                                                                                                                                                                                       |
| `PresenceBars`            | **Hand-rolled SVG/div**        | 1D horizontal bars + labels; trivial, skip lib. (Piecewise x-compression deferred; skeleton is linear.)                                                                                                                                                                    |
| `WrCiChart`               | **Hand-rolled SVG**            | 1D point+whisker sorted by wrLo, 0.5 reference line; simpler by hand than Recharts `ErrorBar`.                                                                                                                                                                             |
| `TierChart` / `TierBadge` | **Hand-rolled SVG/div**        | 1D colored dots + tier chips.                                                                                                                                                                                                                                              |
| `KpiStat`                 | Plain div tiles                | —                                                                                                                                                                                                                                                                          |

All charts are `'use client'` **progressive enhancement**. The server-rendered `MetaTable` and the
next/og card are the SSR/SEO/shareable artifacts — charts do not block first paint or SEO. Palette:
map the R chart colors (`gradient_bad #F87171` → `gradient_good #4ADE80`, warm `#e15759` → cool
`#4e79a7`, tier colors, reference `#60A5FA`) into CSS custom properties defined for **both** light
and dark, so charts recolor correctly under the theme toggle. Follow the `dataviz` skill palette
method. Recharts is the only added chart dep.

---

## 5. Fixture data plan

Adopt Design A's raw-counts-plus-shared-stats approach (stronger anti-drift than precomputing all
derived fields into JSON).

- **Shape parity by construction.** `scripts/gen-fixtures.ts` imports the DTO types and emits typed
  objects — TypeScript fails the build if a fixture drifts from the contract. No hand-authored JSON.
- **Deterministic.** A seeded PRNG (`seedrandom`) → stable OG images, stable SSG output, stable
  snapshot tests. Output JSON is committed for reproducible builds.
- **Raw counts only in JSON.** The generator emits per-archetype and per-matchup **W/L/D counts**
  (per player, for clustering) into `src/datasource/fixtures/data/{format}/{start}_{end}.json`.
  `FixtureDataSource` computes ALL derived fields via `src/lib/stats.ts` at read time AND applies the
  selection pipeline (topN / minMatches / includeArchetypes / hideBuckets / weight / sort) in TS —
  mirroring the R pipeline and the SQL the Postgres repo will run. This exercises the real filter
  logic now.
- **States demoed** (settle IA against reality, not happy-path):
  - Two hand-tuned formats (**Pauper**, **Modern**) + generator-filled Legacy/Pioneer/Standard/
    Vintage/duel-commander so FormatPicker + per-format labels/source text work.
  - **Small archetypes** (5–30 games) → visibly wide CI whiskers, below default threshold so the
    `add=` flow reveals them (the Goldfish differentiator).
  - **Low-confidence matrix cells**: pairs with games<5 (grey '–'), 5–50 (partial washout overlay),
    high-sample (solid); zero-filled missing pairs; blanked mirrors; `ciCrosses50` cases.
  - **Empty window** (one format/window, no tournaments) → drives `EmptyState` on every view.
  - **Buckets**: real `unknown` + `conflict` rows (`isBucket:true`) + a computed `Other` collapse.
  - **Meta changes**: seeded bans/releases (Pauper Seeker ban, Pioneer Cori-Steel ban from memory).
  - Multiple windows per format (current month = default, a prior month, an empty future month).
- The generator is a build-time dev script, never shipped to the client. When Postgres lands, only
  `src/datasource/postgres.ts` is added and `DATA_SOURCE` flips; fixtures stay as the test/OG/dev
  backend.

---

## 6. Component tree

```
app/layout.tsx (RSC)
├─ Geist / Geist_Mono fonts, metadataBase, title template '%s | MetaMage', OG/twitter/icons
├─ <Providers>  (client)
│   ├─ ThemeProvider (next-themes, class strategy on oklch tokens — REAL light/dark, not hardcoded slate)
│   └─ PostHogProvider
├─ <Navbar>  (client, usePathname active-highlight; links preserve lens via buildHref)
├─ {children}
└─ <Toaster>

Shared chrome on every /meta view:
<LensBar>  (sticky, reads searchParams, writes via one setParams() → also fires PostHog)
├─ <FormatPicker>      (shadcn Select over listFormats → changes path segment)
├─ <WindowPicker>      (start + end inputs + preset chips that expand to start/end)
├─ <KnobsPopover>      (topN, minMatches, weight, hideBuckets toggle)
├─ <ArchetypeAdder>    (async combobox over searchArchetypes → appends add=)
└─ <ShareButton>       (copies current parameterized URL + sonner toast; extends legacy)

Charts (src/components/charts/, each takes a typed DTO prop only):
PresenceBars · WrCiChart · TierChart · WrPresenceScatter · MatchupMatrix · TrendChart

Tables / tiles:
MetaTable (tanstack, adapted from QueryResultTable) · CardAdoptionTable · KpiStat · EmptyState · BucketBadge · LowSampleNotice

Per-page composition:
/meta/[format]                    → <LensBar> → KpiStat row → <MetaTable> → grid{PresenceBars, WrPresenceScatter, WrCiChart, TierChart}
/meta/[format]/archetype/[slug]   → header(name/color/tier) → Radix tabs{Decklists(CardAdoptionTable ×2), Matchups(MatchupMatrix single-row + list), Trends(TrendChart), Performance(WrCiChart single)}
/meta/[format]/matrix             → <LensBar> (with n/min) → <MatchupMatrix> full grid
/meta/[format]/changes            → vertical timeline of MetaChangeDTO
/meta/[format]/tournaments        → SourceDTO breakdown + TournamentDTO table
```

**State-in-URL is the core architectural choice.** No client store, no context for lens state.
`src/lib/params.ts` exposes pure `parseMetaQuery(searchParams)` (zod-validated, applies defaults +
clamps + preset expansion; usable in RSC and client) and `buildHref(format, MetaQuery)` (omits
defaults). `useMetaParams()` wraps `useSearchParams`/`useRouter` and exposes `setParams(patch)` which
(1) computes next href, (2) `router.push`, (3) fires `posthog.capture('reparameterize', …)`. One
funnel for the key product metric — wired from day one, never bolted on.

**Rendering/cache.** `generateStaticParams` prebuilds popular combos only (each format's default
current-month landing + matrix + top-N archetype pages), `dynamicParams=true`, `export const
revalidate`. The combinatorial long tail renders on demand; the data layer wraps each method in
`unstable_cache` keyed on the serialized `MetaQuery`. Do not enumerate the infinite space (pitfall #8).

---

## 7. Build order — work packages (disjoint file ownership)

**WP0 is blocking and lands first (it is the shared spine). WP1–WP6 then run in parallel; WP7 and
WP8 close out.** Contract files (`types.ts`, `params.ts`, `stats.ts` signatures) are **read-only after
WP0** — any change is a coordinated contract revision, not a parallel edit. This is what keeps the
parallel wave conflict-free.

### WP0 — Scaffold + freeze the contract _(blocking, 1 agent)_

Create the app and the shared spine everything else imports.
**Owns:**

- `web/package.json`, `web/next.config.ts`, `web/pnpm-workspace.yaml` (if needed), `web/.gitignore`
- `web/tsconfig.json`, `web/eslint.config.mjs`, `web/.prettierrc`, `web/postcss.config.mjs` (copied from legacy)
- `web/components.json`, `web/src/app/globals.css` (copied, session bits stripped)
- `web/src/lib/utils.ts` (`cn()`, verbatim), `web/src/components/ui/*` (copied primitives)
- `web/public/*` (brand assets: logo, favicon, icons)
- `web/src/datasource/types.ts` (all DTOs + `MetaDataSource` interface) — **the contract**
- `web/src/lib/params.ts` (`MetaQuery`, `parseMetaQuery`, `buildHref`, zod schema)
- `web/src/lib/stats.ts` (function **signatures/stubs**: wr, both CI methods, tier bands)

### WP1 — Data + fixtures _(depends on WP0)_

**Owns:**

- `web/src/datasource/fixtures.ts`, `web/src/datasource/index.ts` (`getDataSource()`)
- `web/src/datasource/fixtures/data/**` (committed JSON)
- `web/src/lib/stats.ts` (**implementation** — this is the one WP0 file WP1 fills in; nobody else edits it)
- `web/scripts/gen-fixtures.ts`
- `web/src/datasource/__tests__/stats.snapshot.test.ts`

### WP2 — Charts _(depends only on WP0 types; can mock DTO props before WP1)_

**Owns:**

- `web/src/components/charts/PresenceBars.tsx`
- `web/src/components/charts/WrCiChart.tsx`
- `web/src/components/charts/TierChart.tsx`
- `web/src/components/charts/WrPresenceScatter.tsx`
- `web/src/components/charts/MatchupMatrix.tsx`
- `web/src/components/charts/TrendChart.tsx`
- adds the Recharts dependency

### WP3 — Shared chrome + params runtime _(depends on WP0 params.ts)_

**Owns:**

- `web/src/components/LensBar/**` (FormatPicker, WindowPicker, KnobsPopover, ArchetypeAdder)
- `web/src/components/Navbar.tsx`, `web/src/components/ShareButton.tsx`
- `web/src/hooks/useMetaParams.ts`
- `web/src/app/providers.tsx` (Theme + PostHog)
- `web/src/lib/analytics.ts` (typed `capture()` wrapper)

### WP4 — Tables + shared view primitives _(depends on WP0 types)_

**Owns:**

- `web/src/components/tables/MetaTable.tsx` (tanstack, adapted from QueryResultTable)
- `web/src/components/tables/CardAdoptionTable.tsx`
- `web/src/components/KpiStat.tsx`, `web/src/components/EmptyState.tsx`
- `web/src/components/BucketBadge.tsx`, `web/src/components/LowSampleNotice.tsx`
- adds `@tanstack/react-table` dependency

### WP5 — App shell + routes _(depends on WP0; composes WP1–WP4 via getDataSource + parseMetaQuery; can stub data calls until WP1 lands)_

Split across sub-agents by route (disjoint files) to de-risk overlap.
**Owns:**

- `web/src/app/layout.tsx` (metadata scaffold), `web/src/app/page.tsx` (redirect)
- `web/src/app/meta/[format]/page.tsx` (landing)
- `web/src/app/meta/[format]/archetype/[slug]/page.tsx` (detail + tabs)
- `web/src/app/meta/[format]/matrix/page.tsx`
- `web/src/app/meta/[format]/changes/page.tsx`
- `web/src/app/meta/[format]/tournaments/page.tsx`

### WP6 — SEO + OG _(depends on WP0 params.ts + WP1 listFormats/getMetaReport shapes)_

**Owns:**

- `web/src/app/sitemap.ts`, `web/src/app/robots.ts`
- `web/src/app/og/route.tsx` (next/og `ImageResponse`, embedded assets only)
- `web/src/lib/seo.ts` (`generateMetadata` helper: canonical + openGraph.url + og image href)

### WP7 — Integration pass _(after WP1–WP6 converge, 1 agent)_

Wire `generateStaticParams` + `revalidate` + `unstable_cache` in the data layer; verify deep-link
round-trip (URL→state→URL), OG previews, PostHog capture on reparameterize, EmptyState on the empty
window fixture, bucket hide/show, small-archetype add flow. Touches route files' export config +
`web/src/datasource/index.ts` cache wrappers (coordinate with WP1/WP5 owners).

### WP8 — README + env docs _(small, after WP7)_

**Owns:** `web/README.md`, `web/.env.example` (`DATA_SOURCE`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_POSTHOG_KEY`).

**Ownership rule:** `types.ts` and `params.ts` are read-only after WP0. `stats.ts` is owned solely by
WP1 after WP0 stubs it. No two work packages edit the same file except the coordinated WP7 pass.

---

## 8. Risks & deferred items

**Risks (with mitigations baked into the plan):**

1. **searchParams make pages dynamic → lose SSG/ISR.** → `generateStaticParams` prebuilds popular
   combos only; long tail memoized by `unstable_cache` keyed on serialized `MetaQuery`.
2. **Recharts is client-only, can't render in next/og.** → charts are progressive enhancement over
   the server-rendered `MetaTable`; OG hand-drawn with next/og divs; matrix is SSR-able CSS grid.
3. **Two WR formulas + three CI methods coexist.** → DTO carries both WR fields + explicit
   `ciMethod`; single `stats.ts` computes derived fields for fixtures now and Postgres later; clustered
   `wrLo` is the documented canonical ranking key.
4. **Slug volatility (rename/split/merge; unknown/conflict buckets).** → URLs carry canonical slugs
   only; `resolveSlug()` returns redirect targets for stale slugs; slug↔display map lives in the data
   layer.
5. **DB mid-migration, read-path deferred.** → never import a DB client in pages; `MetaDataSource` is
   the firewall; fixtures are the default backend; swap is a single-file add.
6. **OG needs the window; `opengraph-image.tsx` can't see searchParams.** → dedicated `/og` route
   handler reads full lens; strict CSP → embed assets, no external fetch.
7. **Unknown/Conflict buckets pollute outputs.** → `isBucket` flag + `hideBuckets` (default hide) +
   visual de-emphasis; never in tier math.
8. **Tier/CI must be identical across backends.** → shared `stats.ts` + snapshot test on seeded fixtures.
9. **Over-investing in one rich view (skeleton milestone).** → build all routes thin end-to-end first;
   charts placeholder-simple; buildOrder front-loads breadth over depth.
10. **Analytics as an afterthought.** → `reparameterize` capture wired into the single `setParams()`
    from WP3, not later.

**Deferred to later milestones (explicitly out of scope now):**

- `PostgresDataSource` + real SQL bodies; the SQLite→Postgres query rewrites (date bucketing,
  `date('now',…)`, collation) — behind the interface, unblocked by fixtures.
- Real card-art OG cards (Scryfall remote fetch blocked by CSP; text/logo cards for now).
- Piecewise-compressed presence x-axis (skeleton uses linear).
- Marav-style archetype merge/grouping config surfaced in the UI (data-layer aware, UI later).
- `/compare` side-by-side route (stub only).
- Performance-adjusted "meta score" blend (presence vs WR weighting) — open llm-council decision;
  keep the sortable tier/rank column behind the data layer so the blend can change without UI churn.
- Rich per-view polish, interactivity beyond tooltips, real theme-aware chart palette tuning.

---

## 9. Visual design direction — "The Gathering Ledger · Arena Bronze" (APPROVED)

Validated by the owner on a live spike (2026-07-04). **The spike is the visual source of truth:**
`docs/plans/2026-07-04-design-spike-gathering-ledger.html` — read its CSS tokens and component
treatments before styling anything. Do NOT default to stock shadcn look; adapt the primitives to
these tokens.

### Tokens (CSS custom properties in `globals.css`; light default, dark via `prefers-color-scheme` + `.dark`/`data-theme` override)

| Token                                  | Light (parchment)                 | Dark (Arena bronze)               |
| -------------------------------------- | --------------------------------- | --------------------------------- |
| `--bg`                                 | `#f1ebdc`                         | `#16130e`                         |
| `--surface`                            | `#f9f5e9`                         | `#1e1a13`                         |
| `--raised`                             | `#ece5d0`                         | `#282216`                         |
| `--line` / `--line-strong`             | `#dcd2b8` / `#c5b892`             | `#37301e` / `#4d422a`             |
| `--ink` / `--ink-2` / `--ink-3`        | `#292418` / `#5f5741` / `#8d8368` | `#eae3ce` / `#a99f85` / `#726a55` |
| `--gold` / `--gold-soft`               | `#8c6d23` / `#b3924d`             | `#c9a855` / `#98803f`             |
| `--good` (favored)                     | `#0e8a72`                         | `#2e9e8f`                         |
| `--bad` (unfavored)                    | `#bc4066`                         | `#d45a7e`                         |
| `--mid` (neutral) / `--ref` (50% line) | `#8a8574` / `#7d97b8`             | `#6e7280` / `#5f7ea6`             |

Mana chips are **theme-constant** (printed-cardboard colors): W `#f5f0ce`, U `#abd8ee`,
B `#ccc5c0`, R `#f4a78d`, G `#9bd3ae`, glyph ink `#141010`.

The rose↔teal polarity pair is **CVD-validated** (ΔE 14.0 dark / 12.4 light) — do not swap back
to red/green.

### Type

Display: `Optima, Candara, 'Segoe UI', system-ui` (Beleren-adjacent). Body: `'Avenir Next', Avenir,
'Segoe UI', system-ui`. Data: `ui-monospace, 'SF Mono', Menlo` with `font-variant-numeric: tabular-nums`.

### Rules (bake into components)

1. **Gold = structure** (eyebrows, frames, active lens). Never encodes a value.
2. **Rose↔teal = polarity** only; neutral gray midpoint; text never wears series color.
3. **Pips + rank numbers + card art = identity.** Same rank number across tiles/table/scatter/matrix.
4. **Cards are round, chrome is cut**: art tiles/thumbs get border-radius; panels sharp; hero frames
   and the LensBar get notched corners (`clip-path` polygon, 14–18px cuts).
5. **Confidence = ink**: matrix fill = `color-mix(in oklab, pole amt%, var(--raised))` where amt
   scales with |wr−50| × min(1, games/50); `games<5` → '–', mirror → blanked dot.
6. **WUBRG hairline** under the site header (soft gradient through the five chip colors).
7. Headline pattern: editorial H1 + supporting lede ("Ouroboroid holds the room. The spells are
   winning it.") — the meta-watcher's one-glance answer, derived from the window's data.

### Contract amendment (pre-freeze)

`ArchetypeRowDTO` gains `art: { cardName: string; artCropUrl: string | null } | null` — the
archetype's signature card (Scryfall `art_crop`). Fixtures seed the 14 known Standard mappings
(Badgermole Cub, Slickshot Show-Off, Tablet of Discovery, Eddymurk Crab, Inevitable Defeat, Deceit,
Icetill Explorer, Momo Friendly Flier, Mightform Harmonizer, Felidar Retreat, Divide by Zero,
Rite of Oblivion, Ledger Shredder, Kiln Fiend); other formats may use `null` → mana-gradient
placeholder. The production site loads Scryfall images directly (next/image `remotePatterns` for
`cards.scryfall.io` + attribution in the footer); only the OG route stays asset-embedded.

### New components implied

- `ManaPips` + `ArtCrop` (img with mana-gradient fallback) — shared primitives, owned by **WP0**.
- `DeckTile` ("Top of the field" card grid, top-6 by share) — owned by **WP4**; landing page
  section owned by **WP5**.
- `MetaTable` rows include art thumb (58×36, radius 4) — WP4.
