from fastmcp import FastMCP


mcp = FastMCP(
    name="MTG Tournament MCP",
    instructions="""
        This server exposes tools and resources for MTG tournament analysis:

        ## Tools
          - list_formats(): list all formats with their IDs and names
          - get_format_meta_changes(format_id): all meta changes (bans, set releases) for a format
          - get_archetype_overview(archetype_name): resolve archetype by name with recent performance and key cards
          - get_archetype_trends(format_id, archetype_name, days_back?): weekly presence/winrate trends
          - get_meta_report(format_id, start_date, end_date, limit?): meta report with presence % and winrates
          - get_archetype_winrate(archetype_id, start_date, end_date, exclude_mirror?): compute W/L/D and winrate
          - get_matchup_winrate(format_id, archetype1_name, archetype2_name, start_date, end_date): head-to-head analysis
          - get_card_presence(format_id, start_date, end_date, board?, exclude_lands?, limit?): top cards by presence in format
          - get_archetype_cards(format_id, archetype_name, start_date, end_date, board?, limit?): cards in specific archetype
          - get_tournament_results(format_id, start_date, end_date, min_players?, limit?): winners and top 8 breakdown
          - get_sources(format_id, start_date, end_date, archetype_name?, limit?): recent tournaments with links and source breakdown
          - search_card(query): search card by name (partial/fuzzy) and return details (id, name, type, oracle_text, mana_cost)
          - get_player(player_id): player profile (also accepts handle)
          - search_player(player_handle): fuzzy search a player then return profile
          - query_database(sql, limit): run SELECT-only SQLite queries against the MTG tournament DB

        ## Resources
          - mtg://formats/{format_id}: format overview with recent tournaments and meta snapshot
          - mtg://players/{player_id}: player profile with recent performance and tournament history
          - mtg://archetypes/{archetype_name}: archetype overview with recent performance and key cards

        ## Database Schema
        Tables: formats, players, cards, card_colors, sets, archetypes, tournaments, tournament_entries, deck_cards, matches, meta_changes

        Key table structures:
        - formats: id (uuid), name (citext)
        - sets: id (uuid), code (3-letter set code like "ROE", "2XM"), name, set_type, released_at (date)
        - cards: id (uuid), name (citext), scryfall_oracle_id, is_land (boolean), colors (string like "WUB"), first_printed_set_id (FK to sets), first_printed_date (date)
        - card_colors: id (uuid), card_id (FK), color (single char: W/U/B/R/G) - for efficient color-based queries
        - archetypes: id (uuid), format_id (FK), name (citext), color (text)
        - tournaments: id (uuid), name, date (datetime), format_id (FK), source (MTGO|MELEE|OTHER), link
        - tournament_entries: id (uuid), tournament_id (FK), player_id (FK), archetype_id (FK), wins, losses, draws, rank
        - matches: id (uuid), entry_id (FK), opponent_entry_id (FK), result (WIN|LOSS|DRAW), mirror (boolean), pair_id
        - deck_cards: id (uuid), entry_id (FK), card_id (FK), count, board (MAIN|SIDE)
        - players: id (uuid), handle, normalized_handle (citext)
        - meta_changes: id (uuid), format_id (FK), date, change_type (BAN|SET_RELEASE), description, set_code

        Key relationships:
        - matches.entry_id -> tournament_entries.id
        - matches.opponent_entry_id -> tournament_entries.id  
        - tournament_entries.archetype_id -> archetypes.id
        - tournament_entries.tournament_id -> tournaments.id
        - archetypes.format_id -> formats.id
        - deck_cards.entry_id -> tournament_entries.id
        - deck_cards.card_id -> cards.id
        - card_colors.card_id -> cards.id
        - cards.first_printed_set_id -> sets.id

        Note: matches table has both sides of each match (entry vs opponent), linked by pair_id.
        To avoid double-counting, filter by entry_id < opponent_entry_id or group by pair_id.

        ## Query Constraints & Usage
        - Only SELECT/WITH (CTE) queries allowed
        - NO PRAGMA, DDL, DML, transactions, or schema introspection commands
        - Tool automatically applies LIMIT parameter - do NOT include LIMIT in your SQL
        - Multiple statements (semicolon-separated) are forbidden
        - All UUIDs are stored as 36-character strings

        ## Common Query Patterns
        - Modern format_id: '402d2a82-3ba6-4369-badf-a51f3eff4375'
        - Legacy format_id: '0f68f9f5-460d-4111-94df-965cf7e4d28c'  
        - Pauper format_id: 'cbf69202-6dc7-4861-849e-859d116e7182'
        - Standard format_id: 'ceff9123-427e-4099-810a-39f57884ec4e'
        - Pioneer format_id: '123dda9e-b157-4bbf-a990-310565cbef7c'
        - Vintage format_id: 'dcf29968-f908-4d2e-90a6-4f158bc767be'

        Read-only hardening:
          - DB opened read-only (mode=ro) and PRAGMA query_only=ON on each connection.
          - Tool-level SQL gate allows only SELECT/CTE; forbids DDL/DML/PRAGMA/transactions.
          - For extra safety, make the DB file read-only (chmod 444) and/or run server as a non-writer user.
          - Optionally use a read-only replica file refreshed out-of-band.
    """,
)

# Import all tool and resource modules to register them with the MCP server
from . import (  # noqa: E402
    archetype,  # noqa: F401
    archetype_cards,  # noqa: F401
    archetype_trend,  # noqa: F401
    archetype_wr,  # noqa: F401
    card_presence,  # noqa: F401
    search_card,  # noqa: F401
    format,  # noqa: F401
    matchup_wr,  # noqa: F401
    meta_report,  # noqa: F401
    player,  # noqa: F401
    query_db_any,  # noqa: F401
    tournament_result,  # noqa: F401
    sources,  # noqa: F401
)
