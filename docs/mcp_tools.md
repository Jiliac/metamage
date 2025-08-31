# MCP Tools Overview

This document lists all registered MCP tools and whether their outputs are succinct (small, easy to paste as-is) or better summarized.

| Tool | Succinct output? | 1–2 sentence summary |
|---|---|---|
| list_formats | Yes | Lists all formats with their IDs and names. |
| get_archetype_overview | Yes | Resolves an archetype by name and returns its ID, format, recent 30-day performance, and top cards. |
| get_archetype_winrate | Yes | Wins/losses/draws and winrate (excl. draws) for a given archetype in a date range. |
| get_matchup_winrate | Yes | Head-to-head record and winrate between two archetypes in a window. |
| get_sources | Yes | Recent tournaments with dates, links, and a source breakdown summary. |
| search_card | Yes | Fuzzy/partial search that returns card details and maps to local card_id when possible. |
| get_player | Yes | Player profile with recent participation and the last few results (last 90 days). |
| search_player | Yes | Fuzzy search for a player and return the same profile as get_player. |
| get_format_meta_changes | No | Chronological list of bans and set releases for a format; can span many rows. |
| get_archetype_trends | No | Weekly presence and winrate series for an archetype over N days. |
| get_meta_report | No | Top archetypes in a window with presence and winrates; returns up to the requested limit. |
| get_card_presence | No | Format-wide card adoption with counts and presence percentages; tabular and longer. |
| get_archetype_cards | No | Card adoption within a specific archetype and board (MAIN/SIDE); tabular and longer. |
| get_tournament_results | No | Recent winners list plus a top 8 meta breakdown for the window. |
| query_database | No | Executes arbitrary SELECT queries; output size depends entirely on the query. |

----

Each "No" tool can be explained well on a single page if you lead with a compact summary and tuck detail into charts/tables. Even get_meta_report is fine with the right layout.

Suggested one‑page designs per "No" tool:

- get_format_meta_changes
   - Top: 1–2 sentence summary (window size, counts by type).
   - Main: chronological timeline with badges (BAN/SET_RELEASE), optional filters and search.
   - Extras: collapse long descriptions, paginate by year.
- get_archetype_trends
   - Top: average presence% and winrate across window, best/worst week.
   - Main: two small line charts sharing x-axis (presence%, winrate), tooltips per week.
   - Extras: compact weekly table below charts (entries, matches, WR), downloadable CSV.
- get_meta_report
   - Top: KPIs for window (tournaments, entries, total matches).
   - Main:
      - Left: scatter plot (presence% vs winrate), point size by entries, labels for top N.
      - Right: top-N table (archetype, entries, matches, presence%, WR), sortable.
   - Extras: filters (min entries/matches), toggle exclude draws note, link out to sources.
- get_card_presence
   - Top: counts (unique cards, decks analyzed), board/exclude lands summary.
   - Main: searchable, sortable table (card, decks_playing, total_copies, avg_copies, presence%).
   - Extras: small bar chart of top 10 by presence%, board toggle chips.
- get_archetype_cards
   - Top: archetype + board summary (decks analyzed).
   - Main: table like card_presence but scoped to the archetype.
   - Extras: quick filter for "appears in ≥X% decks", optional card hover preview.
- get_tournament_results
   - Top: KPIs (tournaments meeting min_players, unique winners).
   - Main:
      - Left: winners list (date, event, winner handle, archetype, link).
      - Right: top-8 breakdown stacked bar or table (archetype, top8 count, wins, share%).
   - Extras: source filter, link to "view tournament" where applicable.
- query_database
   - Top: brief safety notes and current LIMIT.
   - Main: SQL editor + results grid (first N rows), rowcount, export CSV.
   - Extras: schema sidebar, recent queries, error panel.
