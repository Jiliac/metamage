from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
import uuid
from ..mcp_server.utils import (
    check_session_rate_limit,
    validate_alias_string,
    validate_archetype_exists,
    validate_alias_insert_sql,
    ALLOWED_ALIAS_SQL,
)
from ..mcp_server.logging_config import mcp_logger


def add_archetype_alias(
    engine: Engine,
    archetype_id: str,
    alias: str,
    confidence_score: float = 1.0,
    source: str = "auto",
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Add an alias for an existing archetype with comprehensive security validation.

    Args:
        engine: SQLAlchemy engine for database connection (must be write-enabled)
        archetype_id: UUID of the target archetype
        alias: The alias string to add
        confidence_score: Confidence level (0.0-1.0), defaults to 1.0
        source: Source of the alias ('auto' for AI, 'manual' for user), defaults to 'auto'
        session_id: Session ID for rate limiting (optional)

    Returns:
        Dict with 'success' boolean and 'message' string, plus 'alias_id' if successful
    """
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

        # 4. Source validation
        if source not in ["auto", "manual"]:
            mcp_logger.warning(
                "Invalid source type",
                extra={
                    "session_id": session_id,
                    "tool_name": "add_archetype_alias",
                    "violation_type": "validation_error",
                    "source": source,
                    "success": False,
                },
            )
            return {"success": False, "message": "Invalid input format provided"}

        # 5. Archetype existence validation
        if not validate_archetype_exists(engine, archetype_id):
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

        # 6. SQL pattern validation
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
        with engine.connect() as conn:
            with conn.begin():  # Use transaction for safety
                conn.execute(
                    text(ALLOWED_ALIAS_SQL),
                    {
                        "alias_id": alias_id,
                        "alias": alias,
                        "archetype_id": archetype_id,
                        "confidence_score": confidence_score,
                        "source": source,
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
