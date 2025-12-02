from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
import uuid

from .utils import alias_write_engine
from .mcp import mcp
from .utils import (
    check_session_rate_limit,
    validate_alias_string,
    validate_archetype_exists,
    validate_alias_insert_sql,
    ALLOWED_ALIAS_SQL,
)
from .logging_config import mcp_logger


@mcp.tool
def add_archetype_alias(
    archetype_id: str, alias: str, confidence_score: float = 0.75
) -> Dict[str, Any]:
    """
    Add a new alias for an existing archetype when standard matching fails.
    This is a WRITE operation that permanently modifies the database.

    CRITICAL: You MUST obtain the target archetype_id using get_archetype_overview()
    before calling this tool. This tool creates aliases that point TO existing archetypes.

    Direction: informal_alias_name → formal_archetype_name
    Example: "Scam deck" → "Rakdos Scam"

    Required Preparation:
    BEFORE using this tool, you MUST:
    1. Identify the target archetype through analysis (deck/card analysis, context clues)
    2. Call get_archetype_overview(target_archetype_name) to obtain its archetype_id
    3. Verify the target archetype exists and matches your analysis
    4. Only then use this tool with the obtained archetype_id

    REMEMBER: The archetype_id parameter is the TARGET archetype's ID, not the alias name's ID.

    This tool should NOT be used for:
    - First attempts at archetype matching (use get_archetype_overview() first)
    - Without first obtaining the target archetype_id via get_archetype_overview()
    - Creating aliases when you haven't identified the target archetype
    - Adding obvious duplicates or variations of existing names

    Parameters:
    - archetype_id: The UUID of the TARGET archetype that the alias should point to
      * REQUIRED: Must be obtained from get_archetype_overview(target_name) first
      * This is the ID of the existing archetype you want the alias to reference
      * Direction: The alias will point TO this archetype
      * Example: If creating alias "Scam deck" → "Rakdos Scam", use Rakdos Scam's ID
    - alias: The new alias string to create (the informal/slang/alternative name)
      * This is the name that users will search for in the future
      * Must be alphanumeric characters, spaces, and hyphens only
    - confidence_score: Optional confidence level (0.0-1.0), defaults to 0.75
      * Higher scores indicate stronger evidence for the match
      * Use your judgment based on the quality of your analysis

    Security: This tool has exclusive write access to archetype_aliases table.
    All insertions are logged and attributed to 'auto' source.

    Workflow Integration:
    - This should be the FINAL step in archetype resolution workflow
    - Required sequence:
      query → get_archetype_overview(query) → [FAILS] → analysis →
      get_archetype_overview(target) → [SUCCEEDS] → add_archetype_alias(target_id, query)
    - Data flow direction: informal_name → formal_archetype
    - The archetype_id must come from a successful get_archetype_overview() call
    - Success enables future queries to find the target archetype via the new alias
    - Failed attempts are logged for review and potential manual correction

    Error Handling:
    - Returns success=false for duplicate aliases
    - Returns success=false for invalid archetype_id
    - Returns success=false for confidence_score outside 0.0-1.0 range
    - All errors include descriptive messages for debugging

    Complete Example Workflow:
    1) User query: "What's the win rate of Scam decks in Modern?"
    2) attempt = get_archetype_overview("Scam deck")
       # Returns: {"error": "Archetype 'Scam deck' not found..."}
    3) [AI performs deck analysis: finds Grief, Solitude, Ephemerate pattern]
    4) [AI concludes: This likely refers to "Rakdos Scam" archetype]
    5) target = get_archetype_overview("Rakdos Scam")  # Lookup target archetype
       # Returns: {"archetype_id": "728f92e8-a84d-4c68-95f5-c4ecdf37f74f",
       #           "archetype_name": "Rakdos Scam", "format_name": "Modern", ...}
       6) result = add_archetype_alias(
           archetype_id="728f92e8-a84d-4c68-95f5-c4ecdf37f74f",  # Target ID
           alias="Scam deck",                                      # New alias
           confidence_score=0.8                                    # Optional, based on analysis
       )
    7) SUCCESS: Future calls to get_archetype_overview("Scam deck") will now
       return the Rakdos Scam archetype data automatically

    Returns:
    {
        "success": true/false,
        "message": "Descriptive success/error message",
        "alias_id": "new_alias_uuid" (if successful)
    }
    """
    session_id = None  # For now, we don't have session context

    # Security validation chain
    try:
        # 1. Rate limiting check (per session)
        if not check_session_rate_limit(session_id or ""):
            mcp_logger.warning(
                "Alias rate limit exceeded",
                extra={
                    "session_id": session_id,
                    "tool_name": "add_archetype_alias",
                    "violation_type": "rate_limit",
                    "success": False,
                },
            )
            return {
                "success": False,
                "message": "Request temporarily unavailable, please try again later",
            }

        # 2. Alias string validation
        alias_valid, alias_error = validate_alias_string(alias)
        if not alias_valid:
            mcp_logger.warning(
                "Alias validation failed",
                extra={
                    "session_id": session_id,
                    "tool_name": "add_archetype_alias",
                    "violation_type": "validation_error",
                    "alias_length": len(alias) if isinstance(alias, str) else 0,
                    "success": False,
                },
            )
            return {"success": False, "message": alias_error}

        # 3. Confidence score validation
        if not 0.0 <= confidence_score <= 1.0:
            mcp_logger.warning(
                "Invalid confidence score",
                extra={
                    "session_id": session_id,
                    "tool_name": "add_archetype_alias",
                    "violation_type": "validation_error",
                    "confidence": confidence_score,
                    "success": False,
                },
            )
            return {"success": False, "message": "Invalid input format provided"}

        # 4. Archetype existence validation
        if not validate_archetype_exists(alias_write_engine, archetype_id):
            mcp_logger.warning(
                "Invalid archetype ID",
                extra={
                    "session_id": session_id,
                    "tool_name": "add_archetype_alias",
                    "violation_type": "validation_error",
                    "success": False,
                },
            )
            return {"success": False, "message": "Invalid input format provided"}

        # 5. SQL pattern validation
        if not validate_alias_insert_sql(ALLOWED_ALIAS_SQL):
            mcp_logger.error(
                "SQL pattern validation failed",
                extra={
                    "session_id": session_id,
                    "tool_name": "add_archetype_alias",
                    "violation_type": "sql_security",
                    "success": False,
                },
            )
            return {
                "success": False,
                "message": "Unable to process alias request due to security restrictions",
            }

        # Generate UUID for the new alias
        alias_id = str(uuid.uuid4())

        # Execute the secure database insertion
        with alias_write_engine.connect() as conn:
            with conn.begin():  # Use transaction for safety
                conn.execute(
                    text(ALLOWED_ALIAS_SQL),
                    {
                        "alias_id": alias_id,
                        "alias": alias,
                        "archetype_id": archetype_id,
                        "confidence_score": confidence_score,
                        "source": "auto",
                    },
                )

        # Log successful operation
        mcp_logger.info(
            "Alias operation completed",
            extra={
                "session_id": session_id,
                "tool_name": "add_archetype_alias",
                "operation": "insert_alias",
                "alias_length": len(alias),
                "confidence": confidence_score,
                "success": True,
            },
        )

        return {
            "success": True,
            "message": f"Successfully added alias '{alias}' for archetype {archetype_id}",
            "alias_id": alias_id,
        }

    except IntegrityError as e:
        # Handle duplicate alias or constraint violations
        mcp_logger.warning(
            "Database integrity violation",
            extra={
                "session_id": session_id,
                "tool_name": "add_archetype_alias",
                "violation_type": "integrity_error",
                "error": str(e),
                "success": False,
            },
        )

        # Return generic error message for security
        return {
            "success": False,
            "message": "Unable to process alias request due to security restrictions",
        }

    except Exception as e:
        # Handle all other exceptions
        mcp_logger.error(
            "Unexpected alias operation error",
            extra={
                "session_id": session_id,
                "tool_name": "add_archetype_alias",
                "violation_type": "unexpected_error",
                "error": str(e),
                "success": False,
            },
        )

        return {
            "success": False,
            "message": "Unable to process alias request due to security restrictions",
        }
