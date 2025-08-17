from typing import Dict, Any
from sqlalchemy import text

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls


@log_tool_calls
@mcp.tool
def get_archetype_trends(
    format_id: str,
    archetype_name: str,
    days_back: int = 30,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Get weekly presence and winrate trends for an archetype over time.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        archetype_name: Name of archetype (case-insensitive)
        days_back: Number of days to look back (default: 30)

    Returns:
        Dict with weekly trend data: dates, entries, matches, winrates

    Workflow Integration:
    - Use with get_meta_report() to correlate an archetype’s trend with overall meta shifts.
    - Combine with get_format_meta_changes() to annotate trend inflection points (bans/set releases).
    - Drill down into specific time windows with get_archetype_winrate() or query_database().

    Related Tools:
    - get_meta_report(), get_archetype_winrate(), get_format_meta_changes(), query_database()

    Example:
    - Find a dip in presence, then use get_sources() for that week range to collect tournament links,
      and query_database() for card-level or matchup-level explanations.
    """
    try:
        days_back = int(days_back)
        if days_back <= 0 or days_back > 365:
            raise ValueError("days_back must be between 1 and 365")
    except (ValueError, TypeError):
        raise ValueError("days_back must be a valid integer between 1 and 365")

    sql = """
        WITH weeks AS (
            SELECT 
                date(t.date, 'weekday 0', '-6 days') as week_start,
                date(t.date, 'weekday 0') as week_end,
                COUNT(DISTINCT te.id) as entries,
                COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) as wins,
                COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END) as losses,
                COUNT(CASE WHEN m.result = 'DRAW' THEN 1 END) as draws,
                COUNT(*) as total_matches
            FROM tournaments t
            JOIN tournament_entries te ON t.id = te.tournament_id
            JOIN archetypes a ON te.archetype_id = a.id
            LEFT JOIN matches m ON te.id = m.entry_id AND m.entry_id < m.opponent_entry_id
            WHERE t.format_id = :format_id
            AND LOWER(a.name) = LOWER(:archetype_name)
            AND t.date >= date('now', '-{} days')
            GROUP BY week_start, week_end
        ),
        total_per_week AS (
            SELECT 
                date(t.date, 'weekday 0', '-6 days') as week_start,
                COUNT(DISTINCT te.id) as total_format_entries
            FROM tournaments t
            JOIN tournament_entries te ON t.id = te.tournament_id
            WHERE t.format_id = :format_id
            AND t.date >= date('now', '-{} days')
            GROUP BY week_start
        )
        SELECT 
            w.week_start,
            w.week_end,
            w.entries,
            w.total_matches,
            w.wins,
            w.losses,
            w.draws,
            ROUND(
                CAST(w.entries AS REAL) / 
                CAST(tpw.total_format_entries AS REAL) * 100, 2
            ) as presence_percent,
            ROUND(
                CAST(w.wins AS REAL) / 
                CAST((w.wins + w.losses) AS REAL) * 100, 2
            ) as winrate_no_draws
        FROM weeks w
        LEFT JOIN total_per_week tpw ON w.week_start = tpw.week_start
        ORDER BY w.week_start
    """.format(days_back, days_back)

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {
                "format_id": format_id,
                "archetype_name": archetype_name,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "archetype_name": archetype_name,
        "days_back": days_back,
        "weekly_trends": data,
    }
