<!-- Generated: 2026-05-11 | Files scanned: 35 | Token estimate: ~650 -->

# Frontend Codemap

Next.js 15 App Router app at `ui/` — read-only viewer for chat sessions and tool results stored in Ops DB.

Stack: Next 15.5 · React 19 · Prisma 6 · Tailwind v4 · shadcn/Radix · @tanstack/react-table · react-markdown.

## Page Tree

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

## Env

- `DATABASE_URL` — Postgres (Ops DB) for Prisma
- `NEXT_PUBLIC_SITE_URL` — used by `sitemap.ts`/`robots.ts` and share links

## Build / Lint

- `npm run dev` / `next dev` · `next build` · `next start`
- ESLint flat config (`eslint.config.mjs`), Prettier `format` / `format:check`
- `postinstall` regenerates Prisma client from `public/prisma/schema.prisma`
