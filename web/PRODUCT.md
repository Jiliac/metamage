# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the meta-watcher.** A competitive Magic: The Gathering player who wants to know what is happening in a format right now. They land on a format's meta overview, take it in at a glance, and drill into one archetype (decklists and matchups) in one click.

**Secondary: the event-prepping player.** The same person in a different situation: deciding what to play and how to tune it. They go deeper into matchups, sideboards, and custom windows, and they often check matchups on a phone at the event. The meta overview is the front door for both.

## Product Purpose

MetaMage is a self-serve explorer for the MTG tournament metagame. It shows presence, win rates, tiers, and the matchup matrix for any format, any time window, and any archetype set, including small archetypes below a publish threshold.

It replaces four static monthly meta images and an under-used chat agent, so that an off-axis question ("the first three months, not the last three") no longer has to become a DM.

Success signals (STRATEGY.md): weekly returning visitors; self-serve exploration rate (sessions that re-parameterize a view: custom window, added archetype, matrix opened); fewer inbound data-request DMs.

## Positioning

MetaMage is the only flexible, self-serve view over data nobody else publishes:

- **Matchup data.** Melee matchups and match-level MTGO results. MTGO never publishes matchups, so this exists nowhere else in public.
- **Hand-tuned archetypes.** Classification rules are maintained by hand. `Unknown` and `Conflict` buckets stay visible but de-emphasized rather than hidden.
- **Performance-adjusted ranking (intended, not yet shipped).** The strategy is to rank archetypes by strength from matchup results, not only by presence (the Goldfish model). Today the UI ranks by presence and shows win rate with CIs alongside; the ranking model is an open decision (see below).
- **Every view is a link.** The URL is the whole state, so any view can be bookmarked, shared, and previewed with an OpenGraph card.

It is not another static meta publisher and not a chatbot. The bet is that interactivity over a dataset only we hold is the moat.

## Operating Context

- **The lens.** Every route is scoped by URL parameters: format (path segment), window, top-N, min-matches, added archetypes, bucket visibility, presence weight, sort, matrix size, selected matrix row. Changing the window is a full data reload.
- **Routes.** Meta overview (`/meta/[format]`), archetype detail (decklists / matchups / trends / performance tabs), full N×N matchup matrix, bans and set-release timeline, tournaments list and event pages (including a cross-format `/meta/all/tournaments`).
- **Formats.** Chips are ordered by recent match volume: modern, pauper, standard, duel-commander, legacy, pioneer, vintage. Modern is the default landing format. Duel Commander has its own banlist committee, not Wizards.
- **Data cadence.** A weekly manual ingestion pipeline. Real-time or daily data is out of scope.
- **Distribution.** Links are shared on social channels where MetaMage already has followers. OG cards for visuals and decklists turn that reach into traffic. The Discord/Twitter/Bluesky agents are parked; later they will become a thin feed that deep-links into views.
- **Sessions on the move.** Matchup checks happen on phones at events, so the mobile matchup surface matters as much as the desktop matrix.

## Capabilities and Constraints

- Next.js 15 app router, React 19, TypeScript strict, Tailwind v4 CSS-first tokens, shadcn/Radix primitives, Recharts for 2D charts, TanStack Table. Deployed on Vercel with ISR.
- Pages read data only through the `MetaDataSource` contract (`src/datasource/types.ts`). The backends are committed fixtures (default) or Neon Postgres. All derived math (win-rate formulas, Wilson and cluster-robust CIs, tier bands, matrix reliability and low-N flags) lives in `src/lib/stats.ts`.
- No client store for view state. `src/lib/params.ts` is the only serializer, and every control writes through `useMetaParams`.
- Statistical honesty is part of the product: sample sizes, confidence intervals, low-sample notices, and de-emphasized Unknown/Conflict buckets are shown, not hidden.
- Card art comes from Scryfall art crops resolved at build time. No runtime Scryfall calls happen in the request path. A mana-gradient placeholder covers missing art.
- Domain vocabulary is defined in `../CONCEPTS.md` (Lens, Window, Archetype, Matchup, "share" = match-weighted presence).
- **Open decision:** the exact ranking model (presence vs win rate vs a blended "meta score") is not settled. Until it is, the overview ranks by presence.
- **Not binding:** the WotC Fan Content Policy notice was not confirmed as a requirement; it is absent from the code today.

## Brand Commitments

- **Name:** MetaMage. A mark exists at `public/logo.png`; whether it is fixed or may be redrawn is undecided.
- **Existing social audience.** MetaMage already posts monthly meta content to followers on social channels. The site must stay recognisable to them.
- **Voice: analytical, no hype.** Copy states numbers and confidence plainly: sample sizes, CIs, records. No "best deck!" claims and no superlatives the data does not support.

## Evidence on Hand

- Real tournament data: the live Neon DB, and the committed fixture DB at `src/datasource/fixtures/data/db.jsonl`.
- Archetype signature-card art map: `src/datasource/art-map.json`.
- Strategy and vocabulary: `../STRATEGY.md`, `../CONCEPTS.md`.
- No testimonials, user counts, press, or traffic figures are on hand. Future work must not invent them.

## Product Principles

1. **The overview answers "what's happening now" at a glance.** Depth is one click away, never in the way.
2. **The user asks the question.** Every view can be re-parameterized and every state is a shareable URL.
3. **Matchups are the moat.** The matrix and per-archetype matchups get the most care, on desktop and on a phone at an event.
4. **Show the confidence, not just the number.** Sample size and uncertainty travel with every stat, and low-N data is flagged, not dropped.
5. **Honest buckets.** Unclassified and conflicting entries stay visible and clearly labelled.

## Accessibility & Inclusion

WCAG 2.2 AA is the product standard:

- Full keyboard access for every lens control, table, tab, and matrix cell.
- Screen-reader equivalents for the matrix and charts.
- Colour (including WUBRG mana colours and win-rate heat) is never the only signal.
- Text contrast is at least 4.5:1.
