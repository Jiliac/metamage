from typing import Dict, Any

from .utils import engine, validate_date_range
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..analysis.archetype import compute_archetype_cards


@log_tool_calls
@mcp.tool
def get_archetype_cards(
    format_id: str,
    archetype_name: str,
    start_date: str,
    end_date: str,
    board: str = "MAIN",
    limit: int = 20,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Get top cards in specific archetype within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        archetype_name: Name of archetype (case-insensitive)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        board: Card board location - 'MAIN' or 'SIDE' (default: MAIN)
        limit: Maximum cards to return (default: 20)

    Returns:
        Dict with card stats: name, total copies, decks playing, average copies, presence %

    Workflow Integration:
    - Start with get_archetype_overview() to confirm the archetype and format.
    - Use search_card() first when you need to focus on a particular card, then:
      - Compare its presence here vs. format-wide via get_card_presence().
    - For performance splits (with/without a card), combine with query_database().

    Related Tools:
    - search_card(), get_card_presence(), get_archetype_overview(), query_database()

    Example Workflow: Check if a tech card is standard in an archetype
    1) cid = search_card("Psychic Frog").card_id
    2) cards = get_archetype_cards(format_id, "Domain Zoo", start, end, "MAIN")
    3) If card appears, use query_database() to compare W/L/D for entries with vs without cid.
    """
    # Validate dates and delegate to analysis
    start, end = validate_date_range(start_date, end_date)
    if board not in ["MAIN", "SIDE"]:
        raise ValueError("board must be 'MAIN' or 'SIDE'")
    return compute_archetype_cards(
        engine, format_id, archetype_name, start, end, board, limit
    )
