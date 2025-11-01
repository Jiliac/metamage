from typing import Dict, Any

from .utils import engine, validate_date_range
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..analysis.matchup import compute_matchup_winrate


@log_tool_calls
@mcp.tool
def get_matchup_winrate(
    format_id: str,
    archetype1_name: str,
    archetype2_name: str,
    start_date: str,
    end_date: str,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Compute head-to-head winrate (excluding draws) between two archetypes within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        archetype1_name: Name of first archetype (case-insensitive)
        archetype2_name: Name of second archetype (case-insensitive)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)

    Returns:
        Dict with matchup stats: wins/losses/draws for archetype1 vs archetype2, winrates

    Workflow Integration:
    - Use after get_archetype_overview() if you need help matching archetype names.
    - Cross-check matchup-specific hypotheses from get_meta_report() or get_archetype_trends().
    - For detailed evidence, use query_database() to extract per-tournament or per-patch matchup rows.

    Related Tools:
    - get_archetype_overview(), get_meta_report(), get_archetype_trends(), query_database(), get_sources()
    """
    # Validate dates and compute via shared analysis function
    start, end = validate_date_range(start_date, end_date)
    return compute_matchup_winrate(
        engine, format_id, archetype1_name, archetype2_name, start, end
    )
