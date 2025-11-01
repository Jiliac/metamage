from typing import Dict, Any

from .utils import engine, validate_date_range
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..analysis.card import compute_card_presence


@log_tool_calls
@mcp.tool
def get_card_presence(
    format_id: str,
    start_date: str,
    end_date: str,
    board: str = None,
    exclude_lands: bool = True,
    limit: int = 20,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Get top cards by presence in format within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        board: Card board location - 'MAIN', 'SIDE', or None for both (default: None)
        exclude_lands: Whether to exclude land cards from results (default: True)
        limit: Maximum cards to return (default: 20)

    Returns:
        Dict with card stats: name, total copies, decks playing, average copies, presence %

    Workflow Integration:
    - Start with search_card() to confirm exact card naming when needed.
    - Compare format-wide adoption here to archetype-specific adoption via get_archetype_cards().
    - Use query_database() for performance splits (e.g., winrate of decks that play the card).

    Related Tools:
    - search_card(), get_archetype_cards(), get_meta_report(), query_database()

    Example:
    - To test a hypothesis about a rising staple:
      1) get_card_presence(format_id, start, end) → see presence_percent
      2) cross-check in specific archetypes via get_archetype_cards()
      3) verify performance with query_database() joins on deck_cards.
    """
    # Validate dates then delegate to shared analysis
    start, end = validate_date_range(start_date, end_date)
    if board is not None and board not in ["MAIN", "SIDE"]:
        raise ValueError("board must be 'MAIN', 'SIDE', or None")
    return compute_card_presence(
        engine, format_id, start, end, board, bool(exclude_lands), limit
    )
