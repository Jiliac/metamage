# MetaMage UI (Next.js)

## Overview
- Browse Chat Sessions and their Messages, Tool Calls, and Tool Results
- Shareable pages for individual tool runs (e.g., `query_database` with a human title)

## Pages
- `/` — Home
- `/sessions` — Session list (ISR)
- `/sessions/[id]` — Session details (with tool results)
- `/tool/[id]` — Tool result page with SEO metadata and social cards

## Data model
- Prisma models map to the Ops DB (`ChatSession`, `ChatMessage`, `ToolCall`, `ToolResult`)
- The UI reads from the same Ops database written by the agents

## Environment
- `NEXT_PUBLIC_SITE_URL` — canonical base URL for OpenGraph/Twitter and links (default `http://localhost:3000`)
- `DATABASE_URL` — Prisma connection to Ops DB (e.g., `file:../../data/ops.db` or Postgres URL)

## Setup
```bash
npm install  # postinstall runs prisma generate
npm run dev
```
Open `http://localhost:3000`

## Build
```bash
npm run build
npm start
```

## Notes
- API routes under `/app/api/sessions` provide JSON for session pages and polling
- Keep the tournament DB read-only in server code; UI is read-only viewer
- If you don't have a `tournament.db` yet, email: `valentinmanes@outlook.fr` for a prebuilt SQLite DB to get started quickly
