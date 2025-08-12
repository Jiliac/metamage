from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text

from .utils import engine
from .mcp import mcp


@mcp.tool
def get_card_presence(
    format_id: str,
    start_date: str,
    end_date: str,
    board: str = "MAIN",
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Get top cards by presence in format within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        board: Card board location - 'MAIN' or 'SIDE' (default: MAIN)
        limit: Maximum cards to return (default: 20)

    Returns:
        Dict with card stats: name, total copies, decks playing, average copies, presence %
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
        WITH total_decks AS (
            SELECT COUNT(DISTINCT te.id) as total_format_decks
            FROM tournament_entries te
            JOIN tournaments t ON te.tournament_id = t.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
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
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
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
                CAST((SELECT total_format_decks FROM total_decks) AS REAL) * 100, 2
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
                "start": start,
                "end": end,
                "board": board,
                "limit": limit,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "board": board,
        "cards": data,
    }
