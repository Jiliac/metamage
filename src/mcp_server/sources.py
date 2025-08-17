from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy import text

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls


@log_tool_calls
@mcp.tool
def get_sources(
    format_id: str,
    start_date: str,
    end_date: str,
    archetype_name: Optional[str] = None,
    limit: int = 3,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Return up to N recent tournaments (with links) for a format and optional archetype within a date window.

    Args:
        format_id: Format UUID
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        archetype_name: Optional archetype name filter (case-insensitive)
        limit: Maximum tournaments to return (default: 3, max: 10)

    Returns:
        Dict containing 'sources': list of {tournament_name, date, link, source} and 'summary' with source breakdown statistics

    Workflow Integration:
    - Use to attach concrete evidence (links) to analyses from other tools (meta_report, matchup_wr, etc.).
    - Filter by archetype_name to support archetype-specific claims.
    - Pair with query_database() for deeper per-event breakdowns after you have the links.

    Related Tools:
    - get_meta_report(), get_matchup_winrate(), get_archetype_trends(), get_tournament_results(), query_database()

    Example:
    - After computing a winrate spike, call get_sources() over the same date window to list tournaments to cite.
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

    if limit <= 0:
        limit = 3
    if limit > 10:
        limit = 10

    sql = """
        SELECT DISTINCT
            t.name AS tournament_name,
            t.date,
            t.link,
            t.source
        FROM tournaments t
        JOIN tournament_entries te ON te.tournament_id = t.id
        LEFT JOIN archetypes a ON te.archetype_id = a.id
        WHERE t.format_id = :format_id
          AND t.date >= :start AND t.date <= :end
          AND (:arch_name IS NULL OR LOWER(a.name) = LOWER(:arch_name))
        ORDER BY t.date DESC
        LIMIT :limit
    """
    params = {
        "format_id": format_id,
        "start": start,
        "end": end,
        "arch_name": archetype_name,
        "limit": limit,
    }
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()

    sources_data = [dict(r._mapping) for r in rows]

    # Calculate source breakdown
    source_counts = {}
    for row in sources_data:
        source = row.get("source", "UNKNOWN")
        source_counts[source] = source_counts.get(source, 0) + 1

    total_tournaments = len(sources_data)
    source_percentages = {}
    if total_tournaments > 0:
        for source, count in source_counts.items():
            source_percentages[source] = round((count / total_tournaments) * 100, 1)

    return {
        "format_id": format_id,
        "archetype_name": archetype_name,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "sources": sources_data,
        "summary": {
            "total_tournaments": total_tournaments,
            "source_breakdown": source_counts,
            "source_percentages": source_percentages,
        },
    }
