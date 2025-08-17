from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text
from fastmcp import Context

from .utils import engine
from .mcp import mcp
from .log_decorator import log_tool_calls


@mcp.tool
@log_tool_calls
def get_meta_report(
    format_id: str, start_date: str, end_date: str, limit: int = 15, ctx: Context = None
) -> Dict[str, Any]:
    """
    Generate meta report showing top archetypes by match presence within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        limit: Maximum archetypes to return (default: 15, max: 20)

    Returns:
        Dict with archetype stats: presence %, winrate (excl. draws), total matches, entries

    Workflow Integration:
    - Use this as an entry point to identify top archetypes, then:
      - get_archetype_overview() / get_archetype_trends() for deeper dives.
      - get_matchup_winrate() to inspect key pairings.
      - get_card_presence() for format staples; get_archetype_cards() for archetype staples.
    - Validate or extend findings with query_database() when you need custom cuts.

    Related Tools:
    - get_archetype_overview(), get_archetype_trends(), get_matchup_winrate(),
      get_card_presence(), get_archetype_cards(), query_database(), get_sources()

    Example:
    - After spotting a rising archetype here, pull sources via get_sources() and include links with your analysis.
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

    # Cap limit at 20
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
            AND m.entry_id < m.opponent_entry_id
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
            AND m.entry_id < m.opponent_entry_id
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
