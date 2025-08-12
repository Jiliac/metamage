from sqlalchemy import text

from .utils import engine
from .mcp import mcp


@mcp.tool
def get_formats_overview() -> str:
    """
    Get overview of all formats with recent tournament activity.
    """
    sql = """
        SELECT 
            f.name as format_name,
            f.id as format_id,
            COUNT(DISTINCT t.id) as recent_tournaments,
            COUNT(DISTINCT te.id) as recent_entries,
            MIN(t.date) as earliest_tournament,
            MAX(t.date) as latest_tournament
        FROM formats f
        LEFT JOIN tournaments t ON f.id = t.format_id AND t.date >= date('now', '-30 days')
        LEFT JOIN tournament_entries te ON t.id = te.tournament_id
        GROUP BY f.id, f.name
        HAVING recent_tournaments > 0
        ORDER BY recent_entries DESC
    """

    with engine.connect() as conn:
        formats = conn.execute(text(sql)).fetchall()

    if not formats:
        return "No format data available for the last 30 days"

    format_list = "\n".join(
        [
            f"- **{fmt.format_name}** (ID: {fmt.format_id}): {fmt.recent_tournaments} tournaments, {fmt.recent_entries} entries"
            for fmt in formats
        ]
    )

    return f"""# MTG Formats Overview (Last 30 Days)

## Active Formats by Tournament Activity

{format_list}

*Use get_meta_report() tool with format_id for detailed meta analysis*

## Common Format IDs
- Modern: 402d2a82-3ba6-4369-badf-a51f3eff4375
- Legacy: 0f68f9f5-460d-4111-94df-965cf7e4d28c
- Pioneer: 123dda9e-b157-4bbf-a990-310565cbef7c
- Standard: ceff9123-427e-4099-810a-39f57884ec4e
"""
