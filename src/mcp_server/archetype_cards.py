from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls


@log_tool_calls
@mcp.tool
def get_archetype_cards(
    format_id: str,
    archetype_name: str,
    start_date: str,
    end_date: str,
    board: str = "MAIN",
    limit: int = 20,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Get top cards in specific archetype within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        archetype_name: Name of archetype (case-insensitive)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        board: Card board location - 'MAIN' or 'SIDE' (default: MAIN)
        limit: Maximum cards to return (default: 20)

    Returns:
        Dict with card stats: name, total copies, decks playing, average copies, presence %

    Workflow Integration:
    - Start with get_archetype_overview() to confirm the archetype and format.
    - Use search_card() first when you need to focus on a particular card, then:
      - Compare its presence here vs. format-wide via get_card_presence().
    - For performance splits (with/without a card), combine with query_database().

    Related Tools:
    - search_card(), get_card_presence(), get_archetype_overview(), query_database()

    Example Workflow: Check if a tech card is standard in an archetype
    1) cid = search_card("Psychic Frog").card_id
    2) cards = get_archetype_cards(format_id, "Domain Zoo", start, end, "MAIN")
    3) If card appears, use query_database() to compare W/L/D for entries with vs without cid.
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except Exception:
        raise ValueError(
            "Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)"
        )
    if end < start:
        raise ValueError("end_date must be >= start_date")

    if board not in ["MAIN", "SIDE"]:
        raise ValueError("board must be 'MAIN' or 'SIDE'")

    sql = """
        WITH archetype_decks AS (
            SELECT COUNT(DISTINCT te.id) as total_archetype_decks
            FROM tournament_entries te
            JOIN tournaments t ON te.tournament_id = t.id
            JOIN archetypes a ON te.archetype_id = a.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
            AND LOWER(a.name) = LOWER(:archetype_name)
        ),
        card_stats AS (
            SELECT 
                c.name as card_name,
                SUM(dc.count) as total_copies,
                COUNT(DISTINCT te.id) as decks_playing,
                ROUND(AVG(CAST(dc.count AS REAL)), 2) as avg_copies_per_deck
            FROM deck_cards dc
            JOIN cards c ON dc.card_id = c.id
            JOIN tournament_entries te ON dc.entry_id = te.id
            JOIN tournaments t ON te.tournament_id = t.id
            JOIN archetypes a ON te.archetype_id = a.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
            AND LOWER(a.name) = LOWER(:archetype_name)
            AND dc.board = :board
            GROUP BY c.id, c.name
        )
        SELECT 
            card_name,
            total_copies,
            decks_playing,
            avg_copies_per_deck,
            ROUND(
                CAST(decks_playing AS REAL) / 
                CAST((SELECT total_archetype_decks FROM archetype_decks) AS REAL) * 100, 2
            ) as presence_percent
        FROM card_stats
        WHERE decks_playing > 0
        ORDER BY decks_playing DESC, total_copies DESC
        LIMIT :limit
    """

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {
                "format_id": format_id,
                "archetype_name": archetype_name,
                "start": start,
                "end": end,
                "board": board,
                "limit": limit,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "archetype_name": archetype_name,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "board": board,
        "cards": data,
    }
