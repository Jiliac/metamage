from typing import Dict, Any
from fastmcp import Context

from .utils import engine, validate_date_range
from .mcp import mcp
from .log_decorator import log_tool_calls
from ..analysis.meta import compute_meta_report


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
    # Validate dates and compute
    start, end = validate_date_range(start_date, end_date)
    result = compute_meta_report(engine, format_id, start, end, limit)
    return result
