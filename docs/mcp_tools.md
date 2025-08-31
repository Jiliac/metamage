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
