from typing import Dict, Any

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..analysis.archetype_action import add_archetype_alias as _add_archetype_alias


@log_tool_calls
@mcp.tool
def add_archetype_alias(
    archetype_id: str,
    alias: str,
    confidence_score: float = 1.0,
    ctx: Context = None
) -> Dict[str, Any]:
    """
    Add a new alias for an existing archetype when standard matching fails.
    This is a WRITE operation that permanently modifies the database.
    
    This tool should NOT be used for:
    - First attempts at archetype matching (use get_archetype_overview() first)
    - Low-confidence guesses (confidence_score < 0.6)
    - Adding obvious duplicates or variations of existing names
    
    Workflow Integration:
    - This should be the FINAL step in archetype resolution workflow
    - Preceded by: get_archetype_overview() → deck/card analysis → confidence assessment
    - Success enables future queries to find this archetype via the new alias
    - Failed attempts are logged for review and potential manual correction
    
    Error Handling:
    - Returns success=false for duplicate aliases
    - Returns success=false for invalid archetype_id
    - Returns success=false for confidence_score outside 0.0-1.0 range
    - All errors include descriptive messages for debugging
    
    Example Workflow:
    1) result = get_archetype_overview("Scam deck")  # Returns error: not found
    2) [Perform card analysis or other investigation]
    3) [Determine this likely refers to "Rakdos Scam" archetype_id="abc123"]
    4) alias_result = add_archetype_alias("abc123", "Scam deck", 0.75)
    5) Future calls to get_archetype_overview("Scam deck") will now succeed
    
    Returns:
    {
        "success": true/false,
        "message": "Descriptive success/error message",
        "alias_id": "new_alias_uuid" (if successful)
    }
    """
    print(f"DEBUG: Adding archetype alias '{alias}' for archetype_id '{archetype_id}' with confidence_score {confidence_score}")
    return _add_archetype_alias(engine, archetype_id, alias, confidence_score, source='auto')
