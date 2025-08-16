from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls


@log_tool_calls
@mcp.tool
def get_tournament_results(
    format_id: str,
    start_date: str,
    end_date: str,
    min_players: int = 32,
    limit: int = 20,
, ctx: Context = None) -> Dict[str, Any]:
    """
    Get tournament winners and top 8 breakdown by archetype.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        min_players: Minimum tournament size to include (default: 32)
        limit: Maximum tournaments to return (default: 20)

    Returns:
        Dict with tournament results: winners, top 8 meta breakdown
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

    # Get tournament winners
    winners_sql = """
        SELECT 
            t.name as tournament_name,
            t.date,
            t.link,
            a.name as winning_archetype,
            p.handle as winner_handle,
            COUNT(DISTINCT all_te.id) as tournament_size
        FROM tournaments t
        JOIN tournament_entries te ON t.id = te.tournament_id AND te.rank = 1
        JOIN archetypes a ON te.archetype_id = a.id
        JOIN players p ON te.player_id = p.id
        JOIN tournament_entries all_te ON t.id = all_te.tournament_id
        WHERE t.format_id = :format_id
        AND t.date >= :start
        AND t.date <= :end
        GROUP BY t.id, t.name, t.date, t.link, a.name, p.handle
        HAVING tournament_size >= :min_players
        ORDER BY t.date DESC
        LIMIT :limit
    """

    with engine.connect() as conn:
        winners = conn.execute(
            text(winners_sql),
            {
                "format_id": format_id,
                "start": start,
                "end": end,
                "min_players": min_players,
                "limit": limit,
            },
        ).fetchall()

    # Get top 8 meta breakdown
    top8_sql = """
        SELECT 
            a.name as archetype_name,
            COUNT(*) as top8_appearances,
            COUNT(CASE WHEN te.rank = 1 THEN 1 END) as wins,
            ROUND(
                CAST(COUNT(*) AS REAL) / 
                (SELECT COUNT(*) 
                 FROM tournament_entries te2 
                 JOIN tournaments t2 ON te2.tournament_id = t2.id 
                 WHERE t2.format_id = :format_id 
                 AND t2.date >= :start 
                 AND t2.date <= :end 
                 AND te2.rank <= 8) * 100, 2
            ) as top8_meta_share
        FROM tournament_entries te
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        WHERE t.format_id = :format_id
        AND t.date >= :start
        AND t.date <= :end
        AND te.rank <= 8
        AND t.id IN (
            SELECT t3.id 
            FROM tournaments t3 
            JOIN tournament_entries te3 ON t3.id = te3.tournament_id 
            GROUP BY t3.id 
            HAVING COUNT(DISTINCT te3.id) >= :min_players
        )
        GROUP BY a.id, a.name
        ORDER BY top8_appearances DESC
    """

    with engine.connect() as conn:
        top8_meta = conn.execute(
            text(top8_sql),
            {
                "format_id": format_id,
                "start": start,
                "end": end,
                "min_players": min_players,
            },
        ).fetchall()

    winners_data = [dict(r._mapping) for r in winners]
    top8_data = [dict(r._mapping) for r in top8_meta]

    return {
        "format_id": format_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "min_players": min_players,
        "tournament_winners": winners_data,
        "top8_meta_breakdown": top8_data,
    }
