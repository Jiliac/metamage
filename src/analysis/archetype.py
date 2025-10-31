"""Archetype analysis functions."""

from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.engine import Engine


def find_archetype_fuzzy(
    engine: Engine, archetype_name: str
) -> Optional[Dict[str, Any]]:
    """
    Find archetype using fuzzy matching with fallback strategies.

    This is a pure function that executes read-only SQL queries to find an archetype
    by name using multiple matching strategies:
    1. Exact match (case-insensitive)
    2. Partial match (contains)
    3. Word-based matching (all words present)

    Args:
        engine: SQLAlchemy Engine for database access
        archetype_name: Name or partial name of archetype to find

    Returns:
        Dict with archetype info (id, name, format_name) or None if not found
    """
    # Strategy 1: Exact match (case-insensitive)
    exact_sql = """
        SELECT a.id, a.name, f.name as format_name
        FROM archetypes a
        JOIN formats f ON a.format_id = f.id
        WHERE LOWER(a.name) = LOWER(:archetype_name)
    """

    with engine.connect() as conn:
        result = conn.execute(
            text(exact_sql), {"archetype_name": archetype_name}
        ).first()
        if result:
            return dict(result._mapping)

    # Strategy 2: Partial match (contains)
    partial_sql = """
        SELECT a.id, a.name, f.name as format_name
        FROM archetypes a
        JOIN formats f ON a.format_id = f.id
        WHERE LOWER(a.name) LIKE LOWER(:pattern)
        ORDER BY LENGTH(a.name)
        LIMIT 1
    """

    with engine.connect() as conn:
        pattern = f"%{archetype_name}%"
        result = conn.execute(text(partial_sql), {"pattern": pattern}).first()
        if result:
            return dict(result._mapping)

    # Strategy 3: Word-based matching (split and match individual words)
    words = archetype_name.lower().split()
    if len(words) > 1:
        word_conditions = []
        params = {}
        for i, word in enumerate(words):
            word_conditions.append(f"LOWER(a.name) LIKE :word_{i}")
            params[f"word_{i}"] = f"%{word}%"

        word_sql = f"""
            SELECT a.id, a.name, f.name as format_name
            FROM archetypes a
            JOIN formats f ON a.format_id = f.id
            WHERE {" AND ".join(word_conditions)}
            ORDER BY LENGTH(a.name)
            LIMIT 1
        """

        with engine.connect() as conn:
            result = conn.execute(text(word_sql), params).first()
            if result:
                return dict(result._mapping)

    return None
