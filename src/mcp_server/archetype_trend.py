from typing import Dict, Any

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..analysis.archetype import compute_archetype_trends


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

    return compute_archetype_trends(engine, format_id, archetype_name, days_back)
