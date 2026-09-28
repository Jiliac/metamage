---
title: "CI/CD and Deployment for web/ + ui/ - Plan"
type: feat
date: 2026-09-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

## Goal Capsule

- **Objective:** Every push to `main` deploys `web/` to `metamages.com` and `ui/` to `ai.metamages.com` on Vercel; every PR gets a green/red CI verdict (lint, typecheck, tests, build) for the slices it touches — Python, web, ui.
- **Means:** Three GitHub Actions workflows with path filtering (`.github/workflows/`), one Vercel project per app (Git integration, previews per PR), plus a small ui build fix that is already reproduced and understood.
- **Authority:** Deployment behavior on R-IDs; workflow mechanics on KTD-IDs.
- **Execution profile:** Config + one-line repo fix; verification is running the pipelines for real (push, observe).
- **Stop conditions:** A workflow requires repo secrets we cannot provision; Vercel Hobby limits block a second project (verified unlikely: Hobby allows multiple projects); ui cannot build without the ops DB AND a live connection from CI (fall back to the dynamic-rendering variant, KTD5).

---

## Verified Baseline (facts, not assumptions)

- **No CI exists**: no `.github/` dir, `gh run list` empty. Repo `Jiliac/metamage`, public, `main` is trunk.
- **PR 10's failing "ui" check** was the Vercel project `metamage` (rootDirectory `ui/`, homepage `metamage.vercel.app`), failing on every head including `main` before the PR existed. Root causes, both reproduced locally:
  1. `ui/pnpm-workspace.yaml` contains literal placeholder text (`'@prisma/client': set this to true or false`) in `allowBuilds`. pnpm 11 hard-fails install (`ERR_PNPM_IGNORED_BUILDS`) before `next build` runs. Fix: replace placeholders with `true` values. Verified locally: install + build then proceed (fix is currently in the working tree, uncommitted).
  2. With (1) fixed, `next build` still fails: `ui/src/app/sessions/[id]/page.tsx` runs `prisma.chatSession.findMany()` in `generateStaticParams` at build time and no `DATABASE_URL` is set. Verified: build succeeds with the Neon ops DB URL (4,326 sessions prerendered, 100 most recent static params) and fails cleanly with an unreachable one.
- **Python**: `tests/` has 7 files (974 lines); `uv run pytest -q` → 37 passed, 7 skipped in 0.4s; `uv run ruff check src tests scripts` → clean. `pyproject.toml` pins Python ≥3.13, dev deps pytest+ruff under `[dependency-groups] dev`. `uv sync --frozen` verified clean.
- **web/**: `pnpm lint`, `pnpm format:check`, `pnpm test` (138 passed), `tsc --noEmit`, `pnpm build` all green with default fixture data. Build also verified green with `DATA_SOURCE=postgres` + `TOURNAMENT_DATABASE_URL` (every route 200 in `next start`, fixtures and postgres modes).
- **ui/**: `pnpm lint`, `pnpm format:check`, `tsc --noEmit` green. No test runner exists in ui (no vitest config, no test script).
- **Ops DB** (Neon `neondb`): tables `chat_sessions` (4,326 rows), `chat_messages`, `tool_calls`, `tool_results` (41,330), owned by `neondb_owner`. Role `metamage_ro` exists but has **no SELECT grant** on these tables (`has_table_privilege(...) = f`) — needs a one-time `GRANT SELECT` before ui can use it (least-privilege, same pattern as `scripts/setup_pg_roles.sql`).
- **Tournament DB** (Neon `tournament`, separate database, same provider): used by web/ when `DATA_SOURCE=postgres` via the SELECT-only `metamage_ro` role; data fresh through 2026-09-21.
- **Local pins**: pnpm 11.9.0 (requires node ≥22.13), Node v26.4.0, Python 3.13, uv 0.11.24, gh 2.99.0. Neither `package.json` declares `engines` or `packageManager`.
- **Env surface for web/** (`web/.env.example`): `DATA_SOURCE` (`fixtures` default | `postgres`), `TOURNAMENT_DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` (drives canonical/OG/robots/sitemap), `NEXT_PUBLIC_POSTHOG_*`. All optional; fixtures mode is hermetic and is the correct CI/build default.
- **Env surface for ui/**: `DATABASE_URL` (Prisma → ops DB; `postgresql://` per `ui/public/prisma/schema.prisma` — the SQLite form in README is stale for this schema), `NEXT_PUBLIC_SITE_URL`.
- **Vercel today**: one project `metamage` (id `prj_Zd2wzMJGWCMd716KS1bPSBpHdzia`), rootDirectory `ui/`, PR previews enabled, production deploys failing since at least 2026-09-27 (missing `DATABASE_URL`, plus cause 1). `vercel` CLI is not installed locally; ops are via dashboard/API.
- **No local `.vercel/` link dirs** in repo root, `web/`, or `ui/`.

---

## Product Contract

### Summary

Three path-filtered GitHub Actions workflows give every PR a fast, correct verdict: Python slices run pytest+ruff; web/ slices run lint+typecheck+tests+build; ui/ slices run lint+typecheck+build. Pushes to `main` are the deploy trigger: two Vercel projects (one per app) build and deploy via Git integration — `web/` serves `metamages.com` from live Postgres, `ui/` serves `ai.metamages.com` from the ops DB. The ui build is fixed (pnpm `allowBuilds` + `DATABASE_URL`); the read-only ops role gains SELECT on the ops tables. Repo docs say what the deployment story is so the next PR doesn't rediscover it.

### Requirements

**CI (GitHub Actions)**

- R1. A PR touching only `src/`, `tests/`, `scripts/`, `visualize/`, or `alembic/` runs the Python workflow; a PR touching only `ui/` runs the ui workflow; web/ likewise. A PR touching docs only runs neither JS/Python job. PRs touching multiple slices run each affected workflow. (KTD1)
- R2. Python job: `uv sync --frozen`, `uv run ruff check src tests scripts`, `uv run pytest -q`. Passes in ≲1 min.
- R3. web job: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `tsc --noEmit`, `pnpm test`, `pnpm build` (fixtures mode — no DB in CI). Passes in ≲3 min.
- R4. ui job: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `tsc --noEmit`, `pnpm build` **with a `DATABASE_URL` reachable from CI** (KTD5) — required because Prisma runs at build time.
- R5. All workflows use frozen lockfiles and pinned action versions; failures name the failing gate in the check name.

**Deployment (Vercel)**

- R6. Two Vercel projects: `metamage-web` (rootDirectory `web/`, production domain `metamages.com`) and `metamage-ui` (rootDirectory `ui/`, production domain `ai.metamages.com`). The legacy project `metamage` (rootDirectory `ui/`) is either repointed or retired so `metamage.vercel.app` does not fight the new split. (KTD6)
- R7. `web/` production env: `DATA_SOURCE=postgres`, `TOURNAMENT_DATABASE_URL` (SELECT-only `metamage_ro`), `NEXT_PUBLIC_SITE_URL=https://metamages.com`, PostHog key/host if desired. Preview env: same but staging-safe values. (KTD7)
- R8. `ui/` production env: `DATABASE_URL` (ops DB, read-only role), `NEXT_PUBLIC_SITE_URL=https://ai.metamages.com`.
- R9. PRs get Vercel preview deployments for both apps when their slice changed (Git integration default per project).
- R10. `metamage_ro` gains SELECT on the ops DB tables so ui serves real sessions with least privilege. (One-time, out-of-repo; owner creds exist locally.)

**Repo hygiene**

- R11. The `ui/pnpm-workspace.yaml` placeholder fix is committed (it is the root cause of the red check; any CI run of ui depends on it).
- R12. README gains a short "Continuous integration & deployment" section documenting the three workflows and the two Vercel projects/domains; stale `ui/README.md` DATABASE_URL example (`file:../../data/ops.db`) is corrected to the Postgres URL form the schema actually requires.
- R13. Nothing in this plan changes app behavior in `web/` or `src/`; no tests are added or removed (per user: making src/ tests is out of scope — they already exist and run green).

### Success Criteria

- Pushing a trivially broken Python change in a branch PR: Python workflow red within ~2 min with the failing gate named; web/ui workflows skipped (no wasted minutes).
- Push to `main` with a `web/` change: `metamages.com` serves the new content within the build's duration; PR previews appear for the two apps on the next PR.
- A fresh clone + the three workflow files: `act`-free local verification exists (the commands R2–R4 each run green locally today — verified during exploration).
- `metamage.vercel.app` no longer receives production traffic (redirect or retired project).
- CI on PR 10's head commit (already merged) would have been green: the failing check was Vercel-only and its root causes are fixed by R11 + R8.

### Scope Boundaries

- No changes to `src/` runtime code, no new Python tests.
- No monitoring/alerting on deployments (Vercel notifications suffice for now).
- No custom domains beyond the two named; no CDN config beyond Vercel defaults.
- No migration of the R visualization or blog to CI.
- Ops-DB grants are one-time shell commands, not code.

---

## Known Technical Decisions

### KTD1: One reusable core workflow + three thin path-filtered entry workflows

**Decision:** `.github/workflows/ci-python.yml`, `ci-web.yml`, `ci-ui.yml`, each with `on: pull_request` + `push: branches: [main]` and path filters; shared steps live per-file (they are small) rather than in a reusable-workflow indirection.

Why: three ~30-line files beat one matrix + `workflow_call` indirection at this size — each gate is visible in the diff that broke it. Path filters (`'src/**', 'tests/**', 'scripts/**', 'visualize/**', 'alembic/**', '.github/workflows/ci-python.yml'`, etc.) keep signal/noise high: a docs-only PR runs nothing, a `web/`-only PR skips Python and ui jobs (saves runner minutes, keeps checks green by omission rather than by hacky "skip" comments).

Anti-pattern guard: do NOT add `if: cancelled()`-style skip hacks or per-job `paths` duplication with the root `on.push.paths` — path filters belong on the trigger only.

Note: `push: paths` + `pull_request: paths` both filter; the push filter covers direct-to-main commits.

### KTD2: Python job shape

```yaml
- uses: astral-sh/setup-uv@v10 (with python-version: '3.13', enable-cache: true)
- run: uv sync --frozen
- run: uv run ruff check src tests scripts
- run: uv run pytest -q
```

Why: `uv sync --frozen` installs exactly from `uv.lock` (verified clean locally, ~10s); cache makes it seconds on warm runners. `uv run` keeps one toolchain (no pip/venv drift). Tests are hermetic (no DB needed — they passed with the 5.2GB `data/tournament.db` untouched; SQLite fallback paths only).

Anti-pattern guard: do not use `pip install -r requirements.txt` (no such file); do not cache `.venv` manually (setup-uv handles it).

### KTD3: Node jobs share a setup pattern; pnpm store cache is automatic

```yaml
- uses: pnpm/action-setup@v6 (with version: 11)
- uses: actions/setup-node@v7 (with node-version: 26, cache: pnpm, cache-dependency-path: web/pnpm-lock.yaml)
- run: pnpm install --frozen-lockfile (working-directory: web)
```

Why: pnpm 11.9.0 locally; pnpm ≥22.13 node requirement → node 26 runner-side. `setup-node`'s `cache: pnpm` keys off the lockfile. `--frozen-lockfile` catches lockfile drift (the placeholder-text workspace file is the cautionary tale). Working-directory keeps the two apps' jobs copy-paste simple; no workspace merge (each app has its own `pnpm-workspace.yaml` by design).

Anti-pattern guard: do NOT run `pnpm i` without `--frozen-lockfile` in CI; do not add `approve-builds` interactivity (the fixed `allowBuilds` in each app's `pnpm-workspace.yaml` whitelists build scripts explicitly — `web/` already has the correct form).

### KTD4: web gates = lint + format + tsc + vitest + build

`next build` subsumes a lot, but explicitly running `tsc --noEmit` catches type errors even when the build's type-checking is skipped on cache hits; vitest (138 tests) is the only behavioral suite in the repo. Build in CI runs `DATA_SOURCE=fixtures` (default) — hermetic, no secrets, matches how OG-cards/ISR pages are generated from the committed fixture DB. Production build behavior is verified in the deploy phase (R7), not per-PR.

Why not build postgres-mode per PR: it would require the tournament DB secret in every PR run; fixtures is the committed contract (`CONCEPTS.md` calls it the parity oracle) and catches contract drift.

### KTD5: ui needs `DATABASE_URL` at build time — resolve via a read-only Neon URL

**Decision:** set `DATABASE_URL` as a GitHub secret (and Vercel env var) pointing at the ops DB via `metamage_ro` **after** granting it SELECT (R10). Build-time `generateStaticParams` then prerenders the 100 most recent sessions (verified: works, 4,326 sessions available). Sessions newer than the build get served through ISR (`revalidate = 30/60`).

Fallback if CI↔Neon proves flaky (region egress blocked, Neon pooler limits): add `export const dynamic = 'force-dynamic'` to `/sessions` + `/sessions/[id]` (drop `generateStaticParams`) so builds need no DB; Vercel runtime uses `DATABASE_URL` per request. This trades build-time prerender for runtime queries — acceptable for a low-traffic viewer, and documented in the workflow file if used.

Anti-pattern guard: never put the owner-role (`neondb_owner`) URL in CI or Vercel for ui; the ops DB is written by the agents via `POSTGRES_URL`, the viewer must stay read-only.

### KTD6: Two Vercel projects; retire/repoint the legacy one

- Create `metamage-web`: rootDirectory `web/`, git-connected to `Jiliac/metamage`.
- Create `metamage-ui`: rootDirectory `ui/`, git-connected, domains `ai.metamages.com`.
- Existing project `metamage` (rootDirectory `ui/`): after `metamage-ui` is live and verified, remove its Git connection (or delete the project). This kills the failing red check at the source — the same root cause PR 10 reported.
- Domains: `metamages.com` + `ai.metamages.com` added to their projects; DNS `A`/`CNAME` records per Vercel's dashboard instructions (the user owns the domain; exact record values come from the Vercel UI at link time).

Why two projects rather than one with a rootDirectory switch: the two apps have different env surfaces (tournament DB vs ops DB), different revalidate profiles, and independent preview deployments — one project per app keeps env vars and deployments scoped correctly.

### KTD7: `NEXT_PUBLIC_SITE_URL` must be set before web builds

`sitemap.ts`, `robots.ts`, `seo.ts` fall back to `http://localhost:3000`; on Vercel the sitemap would advertise localhost URLs. Set `NEXT_PUBLIC_SITE_URL=https://metamages.com` in the project env (production + preview), and `https://ai.metamages.com` for ui. PostHog vars are optional; without a key the app is a silent no-op (verified in `web/src/lib/analytics.ts`).

### KTD8: Do not run `pnpm build` for ui in the web job or vice versa

The two apps have disjoint lockfiles (6,079 vs 7,235 lines) and disjoint dependency trees. A root-level install would create a synthetic workspace; per-app `working-directory` installs keep the pnpm store cache per lockfile. Path filters keep jobs out of each other's way.

### KTD9: Vercel deploys via Git integration, not Actions

The Vercel Git integration already gives: per-PR preview URLs, automatic production deploy on `main` push, instant rollback. Adding a CLI deploy path (pull/build/deploy prebuilt) would double-build every commit and add `VERCEL_TOKEN` handling for zero benefit at this scale. GitHub Actions stays in the lane it's good at: tests/gates. (Vercel's own guidance for this shape.)

Tradeoff accepted: production deploys are gated on CI only informally — Vercel builds on `main` push regardless of the check runs. With green-per-slice PRs and `main` as the only fast-forward path, this is acceptable; if a deploy gate is ever needed, Vercel Deployment Checks can select the GitHub workflows (config, not code).

### KTD10: Gate names a failing step via `name:` on each step

Checks on a PR read like `web / lint`, `web / build` etc. (job+step labels), so a red check needs no log-diving to identify the gate. Cheap, high-value.

---

## Implementation Phases

### Phase 1 — ui build fix (unblocks everything ui)

**What to implement**

- Commit the already-verified `ui/pnpm-workspace.yaml` fix: replace placeholder strings with `true` for all six `allowBuilds` entries (current working-tree diff is exactly this).
- Read `ui/.env.example`: it already documents `DATABASE_URL` only; nothing to add there beyond a comment noting it must be a Postgres URL (schema.prisma provider is `postgresql`).

**Doc references** — `ui/pnpm-workspace.yaml` (the file itself); working-tree diff from this session's exploration.

**Verification checklist**

- `cd ui && pnpm install --frozen-lockfile` → no `ERR_PNPM_IGNORED_BUILDS` failure.
- `DATABASE_URL=<neon ops ro url> pnpm build` → build succeeds, 100 session params prerendered.
- Without `DATABASE_URL`, build fails with the Prisma env error (expected behavior — documented, not fixed).

**Anti-pattern guard** — don't "fix" by removing `ignoredBuiltDependencies`; keep both blocks consistent (allows + ignores).

### Phase 2 — Ops DB grants (one-time shell, before Phase 3 deploy)

**What to implement**

- As `neondb_owner` on the ops DB (`POSTGRES_URL` in root `.env`): `GRANT USAGE ON SCHEMA public TO metamage_ro; GRANT SELECT ON ALL TABLES IN SCHEMA public TO metamage_ro; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO metamage_ro;`
- Verify: `SET ROLE metamage_ro; SELECT count(*) FROM chat_sessions;` → 4,326.
- (Write a `scripts/setup_ops_pg_roles.sql` sibling of `scripts/setup_pg_roles.sql` so the grant is reproducible, not tribal knowledge.)

**Verification checklist** — the SET ROLE probe above returns a count as `metamage_ro`; `metamage_ro` cannot `INSERT`/`UPDATE`/`DELETE` (test one: `INSERT` must fail).

**Anti-pattern guard** — don't grant the owner URL to ui; don't run Alembic against the ops DB from this repo (its migrations target the tournament DB; ops tables are created by `Base.metadata.create_all` in `src/socialbot/server.py`).

### Phase 3 — CI workflows

**What to implement** — three new files under `.github/workflows/`:

1. `ci-python.yml` — paths `src/**`, `tests/**`, `scripts/**`, `visualize/**`, `alembic/**`, `pyproject.toml`, `uv.lock`, `alembic.ini`, self. Steps per KTD2. Also `concurrency: group: ci-python-${{ github.ref }}, cancel-in-progress: true`.
2. `ci-web.yml` — paths `web/**`, self. Steps per KTD3 + KTD4.
3. `ci-ui.yml` — paths `ui/**`, self. Steps per KTD3 + KTD4, with `DATABASE_URL` from a GitHub secret (KTD5).

**Doc references** — actions verified current via registry: `actions/checkout@v7.0.1`, `actions/setup-node@v7.0.0`, `actions/setup-python@v7.0.0`, `pnpm/action-setup@v6.1.0`, `astral-sh/setup-uv@v10.2.0`.

**Verification checklist**

- Local equivalents of every step pass today (verified in exploration; re-run each on the PR).
- Open a draft PR touching a `web/` file: web workflow runs, python/ui skipped; all green.
- Open a draft PR touching a `tests/` file: python runs; web/ui skipped; green.
- Push to `main` (with deploy PRs): all three workflows green on the push.

**Anti-pattern guard** — no `working-directory: web` on the Python job; no `actions/cache@` manual pnpm-store config (setup-node does it); no `run: pnpm test` in the ui workflow (no test script exists — that's a `Script not found` failure, not a skipped suite).

### Phase 4 — Vercel projects + domains

**What to implement** (dashboard-driven; no CLI installed — install one if the user prefers scripting: `npm i -g vercel` + `vercel link` per app):

1. Create project `metamage-web` (import repo, rootDirectory `web/`, framework Next.js auto-detected, pnpm auto-detected via lockfile).
2. Env (Production + Preview): `DATA_SOURCE=postgres`, `TOURNAMENT_DATABASE_URL=<ro url>`, `NEXT_PUBLIC_SITE_URL=https://metamages.com`, `NEXT_PUBLIC_POSTHOG_KEY` (optional).
3. Domain: add `metamages.com` (+ `www` → apex redirect) — follow Vercel's DNS instructions at link time.
4. Create project `metamage-ui` (rootDirectory `ui/`, framework Next.js, pnpm).
5. Env (Production + Preview): `DATABASE_URL=<ops ro url>`, `NEXT_PUBLIC_SITE_URL=https://ai.metamages.com`.
6. Domain: add `ai.metamages.com` (CNAME → `cname.vercel-dns.com`, or apex A record per dashboard).
7. Retire legacy `metamage` project: remove Git connection so it stops red-checking PRs (keep it around until both new projects are verified live, then delete).
8. Verify build logs show `pnpm` + `next build` completing; web is NOT in fixtures mode (check `x-nextjs-cache`/a route renders live data — e.g., a window containing the 2026-09-21 tournament).

**Verification checklist**

- `https://metamages.com` serves the meta explorer (200 on `/`, redirect to `/meta/standard`, sitemap URLs use the apex domain).
- `https://ai.metamages.com/sessions` lists real sessions from the ops DB (not an error page).
- A PR gets preview URLs for exactly the apps whose slice changed.
- Old `metamage.vercel.app` either 404s/redirects or is decommissioned.

**Anti-pattern guard** — do not set `DATA_SOURCE=fixtures` in production (defeats live data); do not use the `neondb_owner` URL anywhere in either project; don't add domains to the legacy project.

### Phase 5 — Docs + land

**What to implement**

- Root `README.md`: add "Continuous integration & deployment" section (three workflows, two projects/domains, what triggers what).
- `ui/README.md`: correct the `DATABASE_URL` example to a Postgres URL; document `NEXT_PUBLIC_SITE_URL=https://ai.metamages.com` for prod.
- Land as one PR (workflows + ui fix + docs), get green checks, merge, observe the first `main` push deploy both apps.

**Verification checklist** — PR shows exactly the expected three checks; after merge, both domains serve updated content; Vercel dashboard shows the deployments tied to the merge commit.

---

## Verification (final gate)

- Re-run the full local gate matrix: `uv run ruff check src tests scripts && uv run pytest -q` (root); `pnpm lint && pnpm format:check && pnpm exec tsc --noEmit && pnpm test && pnpm build` (web); same minus test (ui, with `DATABASE_URL`).
- Live checks: both domains serve 200s on their core routes (list above in Phase 4 verification).
- PR hygiene: a docs-only change runs no workflows (saves minutes); a `src/`-only change runs only Python.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| ui build in CI can't reach Neon (egress/Allowlist) | Low | Blocks ui CI | KTD5 fallback: force-dynamic pages, no build-time DB; still set env for runtime |
| `metamage_ro` grant not yet applied → ui prerender 500s | Medium (if Phase 2 skipped) | ui pages error | Phase 2 is a hard prerequisite for Phase 4; verify with `SET ROLE` probe |
| Hobby plan limits (2 projects, preview count) | Low | One project must be deleted | Verified: Hobby supports multiple projects; legacy `metamage` project is retired in the same pass |
| Path filter misses a file type (e.g., `CONCEPTS.md` moved into `src/`) | Low | Green PR with skipped relevant job | Filters include shared files (`pyproject.toml`, lockfiles, `pnpm-workspace.yaml` of each app, workflow self) |
| `NEXT_PUBLIC_SITE_URL` forgotten → sitemap advertises localhost | Medium | SEO regression | KTD7 makes it an explicit env var step with a verification probe |
| Legacy project keeps red-checking PRs | Medium (if Phase 4.7 skipped) | Confusing CI state | Retire the project in the same PR; verify PR checks clean afterwards |
| pnpm major bump (11 → 12) breaks CI pinning | Low | CI failures on toolchain drift | Pin `version: 11` in `pnpm/action-setup`; bump deliberately later |
