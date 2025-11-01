from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.engine import Engine


def compute_sources(
    engine: Engine,
    format_id: str,
    start: datetime,
    end: datetime,
    archetype_name: Optional[str] = None,
    limit: int = 3,
) -> Dict[str, Any]:
    """
    Shared logic to fetch recent tournaments (with links) for a format and optional archetype within a date window.
    Returns tournaments ordered by date desc and a source breakdown summary.
    """
    # Normalize limit
    if not isinstance(limit, int) or limit <= 0:
        limit = 3
    if limit > 10:
        limit = 10

    tournaments_sql = """
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
        rows = conn.execute(text(tournaments_sql), params).fetchall()

    sources_data = [dict(r._mapping) for r in rows]

    # Calculate accurate source breakdown from ALL tournaments in date range
    source_stats_sql = """
        SELECT
            t.source,
            COUNT(DISTINCT t.id) as count
        FROM tournaments t
        JOIN tournament_entries te ON te.tournament_id = t.id
        LEFT JOIN archetypes a ON te.archetype_id = a.id
        WHERE t.format_id = :format_id
          AND t.date >= :start AND t.date <= :end
          AND (:arch_name IS NULL OR LOWER(a.name) = LOWER(:arch_name))
        GROUP BY t.source
    """

    with engine.connect() as conn:
        source_rows = conn.execute(text(source_stats_sql), params).fetchall()

    source_counts = {}
    total_tournaments = 0
    for row in source_rows:
        source = row.source
        count = row.count
        source_counts[source] = count
        total_tournaments += count

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
