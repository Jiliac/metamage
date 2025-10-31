from typing import Dict, Any
from sqlalchemy import text
from fastmcp import Context

from .utils import engine
from .mcp import mcp
from .log_decorator import log_tool_calls
from ..analysis.archetype import find_archetype_fuzzy


@log_tool_calls
@mcp.tool
def get_archetype_overview(archetype_name: str, ctx: Context = None) -> Dict[str, Any]:
    """
    Get archetype overview with recent performance and key cards.
    Uses fuzzy matching to find archetypes by partial name.

    Workflow Integration:
    - Use this first to resolve an archetype by name (fuzzy matching).
    - Then:
      - get_archetype_cards() for detailed card adoption within a date range/board.
      - get_archetype_winrate() to compute W/L/D and winrate for a specific window.
      - get_archetype_trends() to see weekly presence and winrate trends.
      - get_matchup_winrate() for head-to-head vs another archetype.
      - query_database() for custom splits (e.g., with/without a card, by event size).

    Related Tools:
    - search_card() → get card_id to combine with archetype_id in custom analyses.
    - get_sources() → fetch recent tournaments and links for supporting evidence.
    - get_meta_report() → see how this archetype sits in the broader metagame.

    Example Workflow:
    1) arch = get_archetype_overview("Yawgmoth")
    2) cards = get_archetype_cards(format_id, "Yawgmoth", start, end, board="MAIN")
    3) wr = get_archetype_winrate(arch.archetype_id, start, end, exclude_mirror=True)
    4) trend = get_archetype_trends(format_id, "Yawgmoth", days_back=60)
    5) For nuanced splits, use query_database() with IDs from steps 1–2.
    """
    # Find archetype using fuzzy matching (shared analysis function)
    arch_match = find_archetype_fuzzy(engine, archetype_name)

    if not arch_match:
        return {
            "error": f"Archetype '{archetype_name}' not found. Try a different name or check spelling."
        }

    # Use the found archetype name for the main query
    found_name = arch_match["name"]

    # Get archetype info with recent performance
    sql = """
        SELECT
            a.id as archetype_id,
            a.name as archetype_name,
            f.name as format_name,
            f.id as format_id,
            COUNT(DISTINCT te.id) as recent_entries,
            COUNT(DISTINCT t.id) as tournaments_played,
            ROUND(
                CAST(COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) AS REAL) /
                CAST((COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) + COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END)) AS REAL) * 100, 1
            ) as winrate_no_draws
        FROM archetypes a
        JOIN formats f ON a.format_id = f.id
        LEFT JOIN tournament_entries te ON a.id = te.archetype_id
        LEFT JOIN tournaments t ON te.tournament_id = t.id AND t.date >= date('now', '-30 days')
        LEFT JOIN matches m ON te.id = m.entry_id AND m.entry_id < m.opponent_entry_id
        WHERE LOWER(a.name) = LOWER(:archetype_name)
        GROUP BY a.id, a.name, f.name, f.id
    """

    with engine.connect() as conn:
        arch_info = (
            conn.execute(text(sql), {"archetype_name": found_name}).mappings().first()
        )

    # Get top cards
    cards_sql = """
        SELECT
            c.name as card_name,
            COUNT(DISTINCT te.id) as decks_playing,
            ROUND(AVG(CAST(dc.count AS REAL)), 1) as avg_copies
        FROM deck_cards dc
        JOIN cards c ON dc.card_id = c.id
        JOIN tournament_entries te ON dc.entry_id = te.id
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        WHERE LOWER(a.name) = LOWER(:archetype_name)
        AND t.date >= date('now', '-30 days')
        AND dc.board = 'MAIN'
        GROUP BY c.id, c.name
        ORDER BY decks_playing DESC
        LIMIT 8
    """

    with engine.connect() as conn:
        cards = conn.execute(text(cards_sql), {"archetype_name": found_name}).fetchall()

    return {
        "archetype_id": arch_info["archetype_id"],
        "archetype_name": arch_info["archetype_name"],
        "format_id": arch_info["format_id"],
        "format_name": arch_info["format_name"],
        "recent_performance": {
            "tournament_entries": arch_info["recent_entries"] or 0,
            "tournaments_played": arch_info["tournaments_played"] or 0,
            "winrate_percent": arch_info["winrate_no_draws"],
        },
        "key_cards": [
            {
                "name": c.card_name,
                "avg_copies": c.avg_copies,
                "decks_playing": c.decks_playing,
            }
            for c in cards
        ],
    }
