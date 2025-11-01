from typing import Dict, Any

from ..analysis.card import search_card as compute_search_card
from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls


@log_tool_calls
@mcp.tool
def search_card(query: str, ctx: Context = None) -> Dict[str, Any]:
    """
    Search a card by partial name in the local DB; if not found, fall back to Scryfall fuzzy search.
    Delegates logic to shared analysis.search_card to avoid duplication.
    """
    return compute_search_card(engine, query)
