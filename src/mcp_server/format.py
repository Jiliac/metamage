from sqlalchemy import text

from .utils import engine
from .mcp import mcp

@mcp.resource("mtg://formats/{format_id}")
def get_format_resource(format_id: str) -> str:
    """
    Get format overview with recent tournaments and meta snapshot.
    """
    sql = """
        SELECT 
            f.name as format_name,
            COUNT(DISTINCT t.id) as recent_tournaments,
            COUNT(DISTINCT te.id) as recent_entries,
            MIN(t.date) as earliest_tournament,
            MAX(t.date) as latest_tournament
        FROM formats f
        LEFT JOIN tournaments t ON f.id = t.format_id AND t.date >= date('now', '-30 days')
        LEFT JOIN tournament_entries te ON t.id = te.tournament_id
        WHERE f.id = :format_id
        GROUP BY f.id, f.name
    """

    with engine.connect() as conn:
        format_info = (
            conn.execute(text(sql), {"format_id": format_id}).mappings().first()
        )

    if not format_info:
        return f"Format {format_id} not found"

    # Get top 5 recent archetypes
    meta_sql = """
        SELECT 
            a.name as archetype_name,
            COUNT(DISTINCT te.id) as entries,
            ROUND(
                CAST(COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) AS REAL) / 
                CAST((COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) + COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END)) AS REAL) * 100, 1
            ) as winrate_no_draws
        FROM tournament_entries te
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        LEFT JOIN matches m ON te.id = m.entry_id AND m.entry_id < m.opponent_entry_id
        WHERE t.format_id = :format_id
        AND t.date >= date('now', '-30 days')
        GROUP BY a.id, a.name
        ORDER BY entries DESC
        LIMIT 5
    """

    with engine.connect() as conn:
        meta_rows = conn.execute(text(meta_sql), {"format_id": format_id}).fetchall()

    meta_summary = "\n".join(
        [
            f"  {row.archetype_name}: {row.entries} entries ({row.winrate_no_draws}% WR)"
            for row in meta_rows
        ]
    )

    return f"""# {format_info["format_name"]} Format Overview

## Recent Activity (Last 30 Days)
- **Tournaments**: {format_info["recent_tournaments"] or 0}
- **Total Entries**: {format_info["recent_entries"] or 0}
- **Date Range**: {format_info["earliest_tournament"] or "N/A"} to {format_info["latest_tournament"] or "N/A"}

## Top Meta Archetypes
{meta_summary or "No recent data available"}

*Use mtg://archetypes/[name] for detailed archetype information*
"""
