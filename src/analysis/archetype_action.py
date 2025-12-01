from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
import uuid


def add_archetype_alias(
    engine: Engine,
    archetype_id: str,
    alias: str,
    confidence_score: float = 1.0,
    source: str = "auto"
) -> Dict[str, Any]:
    """
    Add an alias for an existing archetype.
    
    Args:
        engine: SQLAlchemy engine for database connection
        archetype_id: UUID of the target archetype
        alias: The alias string to add
        confidence_score: Confidence level (0.0-1.0), defaults to 1.0
        source: Source of the alias ('auto' for AI, 'manual' for user), defaults to 'auto'
        
    Returns:
        Dict with 'success' boolean and 'message' string, plus 'alias_id' if successful
    """
    try:
        # Validate confidence score range
        if not 0.0 <= confidence_score <= 1.0:
            return {
                "success": False,
                "message": "Confidence score must be between 0.0 and 1.0"
            }
            
        # Validate source
        if source not in ["auto", "manual"]:
            return {
                "success": False,
                "message": "Source must be 'auto' or 'manual'"
            }
        
        # Generate UUID for the new alias
        alias_id = str(uuid.uuid4())
        
        # Insert the new alias
        insert_sql = """
            INSERT INTO archetype_aliases (id, alias, archetype_id, confidence_score, source)
            VALUES (:alias_id, :alias, :archetype_id, :confidence_score, :source)
        """
        
        with engine.connect() as conn:
            with conn.begin():  # Use transaction for safety
                conn.execute(text(insert_sql), {
                    "alias_id": alias_id,
                    "alias": alias,
                    "archetype_id": archetype_id,
                    "confidence_score": confidence_score,
                    "source": source
                })
        
        return { "success": True,
            "message": f"Successfully added alias '{alias}' for archetype {archetype_id}",
            "alias_id": alias_id
        }
        
    except IntegrityError as e:
        # Handle duplicate alias or invalid archetype_id
        if "uq_alias_archetype_id" in str(e):
            return {
                "success": False,
                "message": f"Alias '{alias}' already exists for this archetype"
            }
        elif "foreign key" in str(e).lower():
            return {
                "success": False,
                "message": f"Archetype ID {archetype_id} does not exist"
            }
        else:
            return {
                "success": False,
                "message": f"Database constraint violation: {str(e)}"
            }
            
    except Exception as e:
        return {
            "success": False,
            "message": f"Unexpected error: {str(e)}"
        }
