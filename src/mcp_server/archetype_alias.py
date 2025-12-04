from typing import Dict, Any

from .utils import alias_write_engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..analysis.archetype_action import add_archetype_alias as add_archetype_alias_impl


@log_tool_calls
@mcp.tool
def add_archetype_alias(
    archetype_id: str,
    alias: str,
    confidence_score: float = 0.75,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Add a new alias that points to an existing archetype.
    Creates permanent database entry enabling future queries to resolve this alias.

    Direction: alias (informal name) → archetype_id (target archetype)
    Example: "Scam deck" → "Rakdos Scam"

    Required workflow:
    1. User query fails: get_archetype_overview("Scam deck") → not found
    2. Analyze context to identify target archetype
    3. Get target ID: get_archetype_overview("Rakdos Scam") → archetype_id
    4. Create alias: add_archetype_alias(archetype_id, "Scam deck")

    Parameters:
    - archetype_id: UUID of the target archetype (from get_archetype_overview)
    - alias: New alias string (alphanumeric, spaces, hyphens only)
    - confidence_score: Match confidence 0.0-1.0 (default: 0.75)

    Returns:
    {"success": bool, "message": str, "alias_id": str (if successful)}

    Error conditions: duplicate alias, invalid archetype_id, invalid confidence_score
    """
    return add_archetype_alias_impl(
        engine=alias_write_engine,
        archetype_id=archetype_id,
        alias=alias,
        confidence_score=confidence_score,
        source="auto",
        session_id=None,
    )
