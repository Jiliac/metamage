<!-- Generated: 2026-10-06 | Files scanned: ~70 | Token estimate: ~1100 -->

# Frontend Codemap

Two Next.js 15 App Router apps, both deployed by Vercel git integration on push to `main`:

- `web/` — public tournament meta explorer → https://metamages.com (Vercel `metamage-web`)
- `ui/` — chat session viewer → https://ai.metamages.com (Vercel `metamage-ui`)

Sections after `web/` document `ui/`: read-only viewer for chat sessions and tool results stored in Ops DB. Stack: Next 15.5 · React 19 · Prisma 6 · Tailwind v4 · shadcn/Radix · @tanstack/react-table · react-markdown.

## web/ — Public Meta Explorer

Stack: Next 15.5 · React 19 · Tailwind v4 · @tanstack/react-table · Recharts · Radix. Reads Tournament DB directly (no API layer) or committed fixtures — backend chosen once by `DATA_SOURCE`.

### Page Tree

```
web/src/app/
├── layout.tsx              root shell: metadataBase, fonts, Navbar, Providers, Toaster
├── page.tsx                redirect → /meta/{DEFAULT_FORMAT} (modern, per FORMAT_ORDER)
├── providers.tsx           client providers: next-themes + PostHog
├── robots.ts, sitemap.ts   SEO endpoints (use NEXT_PUBLIC_SITE_URL)
├── og/route.tsx            dynamic OpenGraph card (nodejs runtime, reads query-string lens)
└── meta/[format]/
    ├── page.tsx            meta overview (tiers, presence, trends)
    ├── archetype/[slug]/   archetype detail
    ├── matrix/page.tsx     matchup matrix
    ├── tournaments/page.tsx tournament results
    └── changes/page.tsx    meta changes (bans / set releases)
```

### Datasource (`web/src/datasource/`)

`DATA_SOURCE` picks the backend: `fixtures` (default — committed JSON under `fixtures/`, hermetic, used by CI) or `postgres` (`TOURNAMENT_DATABASE_URL`, SELECT-only `metamage_ro` role; fails loudly if the URL is missing). Types + derived stats in `types.ts` / `derive.ts`; `format-order.ts` pins the format chip order.

### Components (`web/src/components/`)

| File / dir                                     | Role                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `Navbar.tsx`                                   | top nav (format chips per `FORMAT_ORDER`)                             |
| `LensBar/`                                     | lens controls: FormatPicker, WindowPicker, KnobsPopover, ArchetypeAdder |
| `charts/`                                      | TierChart, TrendChart, MatchupMatrix, PresenceBars, WrCiChart, WrPresenceScatter |
| `tables/`                                      | MetaTable, CardAdoptionTable, MatchupList                             |
| `DeckTile`, `ArtCrop`, `ManaPips`, `BucketBadge`, `KpiStat` | deck/card display atoms                                  |
| `ui/*`                                         | shadcn primitives                                                     |

Scripts (`web/scripts/`): `gen-fixtures.ts` (regenerate fixture JSON), `gen-archetype-art.ts` (art map, uses `TOURNAMENT_DATABASE_URL`).

### Env (web)

- `DATA_SOURCE` — `fixtures` (default) | `postgres`
- `TOURNAMENT_DATABASE_URL` — Tournament DB Postgres URL (read-only role)
- `NEXT_PUBLIC_SITE_URL` — public origin (robots/sitemap/OG)
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` — optional analytics

## ui/ — Session Viewer

Next.js 15 App Router app at `ui/`.

## Page Tree (`ui/`)

```
ui/src/app/
├── layout.tsx              root layout, fonts, Navbar
├── page.tsx                landing → links into /sessions
├── globals.css             tailwind base + theme tokens
├── robots.ts, sitemap.ts   SEO endpoints (use NEXT_PUBLIC_SITE_URL)
├── mana/page.tsx           mana-curve / manabase reference page
├── sessions/
│   ├── page.tsx            session list (calls /api/sessions)
│   └── [id]/page.tsx       session detail → SessionView component
├── tool/[id]/page.tsx      shareable single tool-call view
└── api/sessions/
    ├── route.ts            GET — list sessions (paginated)
    ├── [id]/route.ts       GET — session header + counts
    └── [id]/messages/route.ts  GET — messages + nested tool calls + results
```

## API → Data Flow

```
GET /api/sessions                   → Prisma.chatSession.findMany   (id, provider, title, lastMessage, _count.messages)
GET /api/sessions/[id]              → ChatSession + counts
GET /api/sessions/[id]/messages     → ChatMessage[] + ToolCall[] + ToolResult (nested, ordered by sequenceOrder)
```

All routes use `@/lib/prisma` singleton. No writes — UI is read-only.

## Components (`ui/src/components/`)

| File                                           | Role                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `Navbar.tsx`                                   | top nav, links to /sessions, /mana                                           |
| `SessionView.tsx`                              | renders message timeline with collapsible tool calls                         |
| `ToolCallItem.tsx`, `ToolCallItemSuccinct.tsx` | full / compact tool call card                                                |
| `ToolResultView.tsx`                           | renders structured tool output                                               |
| `QueryResultTable.tsx`                         | tabular renderer (TanStack table) for `query_database` results               |
| `ShareButton.tsx`                              | copy-link for /tool/[id] permalinks                                          |
| `toolCallUtils.tsx`                            | shared input/output formatters                                               |
| `tool_utils/`                                  | per-tool rendering: `renderers.tsx`, `summarize.ts`, `labels.ts`, `types.ts` |
| `ui/*`                                         | shadcn primitives: button, card, table, tabs, badge, collapsible, sonner     |

## Tool-Specific Rendering

`tool_utils/renderers.tsx` dispatches on `toolName` (e.g., `get_meta_report` → tier table, `query_database` → `QueryResultTable`, `search_card` → card detail). Labels/summaries live in `labels.ts` / `summarize.ts`.

## Types & Helpers

- `src/types/chat.ts` — UI-side message / tool-call DTOs (mirror Prisma shapes)
- `src/lib/prisma.ts` — `PrismaClient` singleton (dev hot-reload safe)
- `src/lib/utils.ts` — `cn()` tailwind merge

## Env (`ui/`)

- `DATABASE_URL` — Postgres (Ops DB) for Prisma (CI secret: `OPS_DATABASE_URL`)
- `NEXT_PUBLIC_SITE_URL` — used by `sitemap.ts`/`robots.ts` and share links (also read by the bots when building session URLs; default `https://ai.metamages.com`)

## Build / Lint (`ui/`)

- `npm run dev` / `next dev` · `next build` · `next start`
- ESLint flat config (`eslint.config.mjs`), Prettier `format` / `format:check`
- `postinstall` regenerates Prisma client from `prisma/schema.prisma`
