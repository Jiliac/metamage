---
name: MetaMage
last_updated: 2026-06-14
---

# MetaMage Strategy

## Target problem

Competitive MTG players want to read the current and historical metagame on their own
terms — any format, any time window (last week, Q1, "the first three months, not the last
three"), any archetype including the small ones below a publish threshold — and they want
matchup data, which MTGO never publishes and which therefore exists nowhere public. We hold
that data (Melee matchups, match-level MTGO results, hand-tuned archetypes), but today it
escapes only as four static monthly images or via an agent nobody uses — so every off-axis
question becomes a DM.

## Our approach

Win by being the only flexible, self-serve explorer over data nobody else publishes: every
chart we post as a static monthly image becomes a live view the user re-parameterizes
themselves, and the matchup data lets us rank archetypes by performance-adjusted strength,
not just presence the way Goldfish does. We are not another static meta publisher and not a
chatbot — the bet is that interactivity over a uniquely-held dataset is the moat.

## Who it's for

**Primary:** Meta-watcher — wants to know what's happening in the format _right now_ at a
glance, landing on a meta overview and drilling into any archetype (list + matchups) in one
click.

**Secondary:** Event-prepping competitive player — goes deeper into matchups and sideboards
to decide what to play and how to tune it. Same surface; the meta overview is the front door.

## Key metrics

- **Weekly returning visitors** — is anyone coming back to check the meta. (PostHog, automatic)
- **Self-serve exploration rate** — % of sessions that re-parameterize a view (custom window,
  add a small archetype, open the matrix); the truest "they answered their own question"
  signal. (PostHog custom events)
- **Inbound data-request DMs** — the original pain; if the site works, this drops. (manual
  gut-check, not a dashboard)

## Tracks

### The explorer (priority)

Meta-overview landing → archetype view (decklists + matchups) → flexible parameterization
(any format, any time window, any archetype set), plus the beautiful matchup matrix and
performance-adjusted ranking. Card images (Scryfall), decklist rendering, and live
replacements for the R-generated graphs all live here and are first-class. Open design
question to settle in `ce-brainstorm`: the exact ranking model — presence vs win-rate vs a
blended "meta score" (a good `/llm-council` decision).

_Why it serves the approach:_ this _is_ the product — the interactive surface over uniquely-held data.

### Online data backbone

Move `tournament.db` (SQLite) → online Postgres and make it the live, queryable source for
the web app. Pick a provider as part of this (Neon is the incumbent but is disliked/expensive).

_Why it serves the approach:_ nothing self-serve is possible until the data is online.

### Shareable distribution

Every view is a deep-link; static monthly images become live shareable pages with OpenGraph
cards for both visuals and decklists; social/agents shrink to a feed that auto-posts links
back into the site.

_Why it serves the approach:_ turns existing social reach into traffic, cheaply.

## Not working on

- **Real-time / daily ingestion** — the weekly manual pipeline stays; not investing here.
- **Mastra agent rebuild** — parked, not dropped. Once the website is the canonical surface,
  rebuild the Discord/Twitter/Bluesky agents on Mastra as a thin layer that deep-links into
  views (dropping Sonnet-era tooling/models). Revisit after web parity ships.
- **MCP server rewrite** — out of scope; the existing read-only tools are fine.
