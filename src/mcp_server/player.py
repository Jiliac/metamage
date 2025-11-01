from typing import Dict, Any

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..analysis.player import compute_player_profile


@log_tool_calls
@mcp.tool
def get_player(player_id_or_handle: str, ctx: Context = None) -> Dict[str, Any]:
    """
    Get player profile with recent tournament entries and performance.
    Accepts either a player UUID or player handle (with fuzzy matching).

    Returns structured data including:
    - player_id, handle
    - recent_performance: tournaments_played, total_entries, avg_rounds, last_tournament
    - recent_results: list of recent tournament results with archetype, record, and rank

    Workflow Integration:
    - Use get_sources() to gather recent tournaments for the formats a player competes in.
    - For deeper stats (e.g., per-archetype breakdown), use query_database() with the returned player_id.

    Related Tools:
    - get_sources(), query_database(), get_archetype_overview()

    Example:
    - Identify the player's primary archetypes over the last N days with a custom query in query_database()
      joining tournament_entries, tournaments, and archetypes by player_id.
    """
    return compute_player_profile(engine, player_id_or_handle)
