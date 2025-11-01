from datetime import datetime
from typing import Dict, Any, Optional

from ..analysis.sources import compute_sources
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
    **FOR CITATION ONLY** - Return up to N recent tournaments (with links) for a format and optional archetype within a date window.

    IMPORTANT: This returns tournaments ordered by DATE (most recent first), NOT by performance.
    Do NOT use this tool for finding "top performing" entries or performance analysis.

    Use this tool ONLY when you need tournament links to cite as sources for claims made by other tools.

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

    # Delegate to shared analysis implementation
    return compute_sources(engine, format_id, start, end, archetype_name, limit)
