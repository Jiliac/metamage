from typing import Dict, Any

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..analysis.archetype import compute_archetype_overview


@log_tool_calls
@mcp.tool
def get_archetype_overview(archetype_name: str, ctx: Context = None) -> Dict[str, Any]:
    """
    Get archetype overview with recent performance and key cards.
    Uses fuzzy matching to find archetypes by partial name.

    Workflow Integration:
    - Use this first to resolve an archetype by name (fuzzy matching).
    - Then:
      - get_archetype_cards() for detailed card adoption within a date range/board.
      - get_archetype_winrate() to compute W/L/D and winrate for a specific window.
      - get_archetype_trends() to see weekly presence and winrate trends.
      - get_matchup_winrate() for head-to-head vs another archetype.
      - query_database() for custom splits (e.g., with/without a card, by event size).

    Related Tools:
    - search_card() → get card_id to combine with archetype_id in custom analyses.
    - get_sources() → fetch recent tournaments and links for supporting evidence.
    - get_meta_report() → see how this archetype sits in the broader metagame.

    Example Workflow:
    1) arch = get_archetype_overview("Yawgmoth")
    2) cards = get_archetype_cards(format_id, "Yawgmoth", start, end, board="MAIN")
    3) wr = get_archetype_winrate(arch.archetype_id, start, end, exclude_mirror=True)
    4) trend = get_archetype_trends(format_id, "Yawgmoth", days_back=60)
    5) For nuanced splits, use query_database() with IDs from steps 1–2.
    """
    return compute_archetype_overview(engine, archetype_name)
