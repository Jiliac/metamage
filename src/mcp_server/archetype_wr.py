from typing import Dict, Any
from fastmcp import Context

from .utils import engine, validate_date_range
from .mcp import mcp
from .log_decorator import log_tool_calls
from ..analysis.archetype import compute_archetype_winrate


@mcp.tool
@log_tool_calls
def get_archetype_winrate(
    archetype_id: str,
    start_date: str,
    end_date: str,
    exclude_mirror: bool = True,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Compute wins/losses/draws and winrate (excluding draws) for a given archetype_id within [start_date, end_date].
    Dates must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).

    Workflow Integration:
    - Resolve archetype_id via get_archetype_overview() when starting from a name.
    - Compare with format context via get_meta_report() or time-slice using get_archetype_trends().
    - For matchup-specific rates, use get_matchup_winrate().

    Related Tools:
    - get_archetype_overview(), get_meta_report(), get_archetype_trends(), get_matchup_winrate(), query_database()

    Example:
    1) arch = get_archetype_overview("Rakdos Scam") → pick ID
    2) wr = get_archetype_winrate(arch.id, "2025-01-01", "2025-06-30", exclude_mirror=True)
    3) If needed, validate specific slices with query_database() using the same date bounds.
    """
    # Validate dates and delegate to shared analysis
    start, end = validate_date_range(start_date, end_date)
    return compute_archetype_winrate(engine, archetype_id, start, end, exclude_mirror)
