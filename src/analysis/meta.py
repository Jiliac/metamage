from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text
from sqlalchemy.engine import Engine


def compute_meta_report(
    engine: Engine,
    format_id: str,
    start: datetime,
    end: datetime,
    limit: int = 15,
) -> Dict[str, Any]:
    """
    Compute metagame report (presence and winrate excluding draws) for a format within a date range.

    This is a pure function that executes a read-only SQL query using the provided SQLAlchemy engine.
    It is shared between the MCP server and the ChatGPT app to avoid duplicating logic.

    Args:
        engine: SQLAlchemy Engine (opened read-only in the server utils)
        format_id: UUID of the format
        start: Start datetime (inclusive)
        end: End datetime (inclusive)
        limit: Max archetypes to return (default 15, capped at 20)

    Returns:
        Dict containing:
          - format_id
          - start_date (ISO)
          - end_date (ISO)
          - archetypes: list of dicts with presence and winrate fields
    """
    # Cap and sanitize limit
    if not isinstance(limit, int) or limit <= 0:
        limit = 15
    if limit > 20:
        limit = 20

    sql = """
        WITH total_matches AS (
            SELECT COUNT(*) as total_format_matches
            FROM matches m
            JOIN tournament_entries te ON m.entry_id = te.id
            JOIN tournaments t ON te.tournament_id = t.id
            WHERE t.format_id = :format_id
              AND t.date >= :start
              AND t.date <= :end
        ),
        archetype_stats AS (
            SELECT
                a.name as archetype_name,
                COUNT(DISTINCT te.id) as total_entries,
                COUNT(DISTINCT t.id) as tournaments_played,
                COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) as total_wins,
                COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END) as total_losses,
                COUNT(CASE WHEN m.result = 'DRAW' THEN 1 END) as total_draws,
                COUNT(*) as total_matches
            FROM matches m
            JOIN tournament_entries te ON m.entry_id = te.id
            JOIN tournaments t ON te.tournament_id = t.id
            JOIN archetypes a ON te.archetype_id = a.id
            WHERE t.format_id = :format_id
              AND t.date >= :start
              AND t.date <= :end
            GROUP BY a.id, a.name
        )
        SELECT 
            archetype_name,
            total_entries,
            tournaments_played,
            total_wins,
            total_losses,
            total_draws,
            total_matches,
            ROUND(
                CAST(total_matches AS REAL) / 
                CAST((SELECT total_format_matches FROM total_matches) AS REAL) * 100, 2
            ) as presence_percent,
            ROUND(
                CAST(total_wins AS REAL) / 
                CAST((total_wins + total_losses) AS REAL) * 100, 2
            ) as winrate_percent_no_draws
        FROM archetype_stats
        WHERE total_matches > 0
        ORDER BY total_matches DESC
        LIMIT :limit
    """

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {"format_id": format_id, "start": start, "end": end, "limit": limit},
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "archetypes": data,
    }
