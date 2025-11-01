"""SQL query execution utilities for ChatGPT app."""

from typing import Dict, Any
from sqlalchemy import text
from sqlalchemy.engine import Engine


def validate_select_only(sql: str) -> str:
    """
    Allow only a single SELECT/CTE statement; block PRAGMA/DDL/DML/transactions/etc.
    Returns the SQL trimmed of a trailing semicolon.
    """
    if not isinstance(sql, str):
        raise ValueError("SQL must be a string")
    s = sql.strip()
    if s.endswith(";"):
        s = s[:-1].strip()
    lowered = s.lower()
    if not (lowered.startswith("select") or lowered.startswith("with")):
        raise ValueError("Only SELECT queries are allowed (including WITH ... SELECT).")
    forbidden = [
        "insert",
        "update",
        "delete",
        "alter",
        "drop",
        "create",
        "attach",
        "detach",
        "pragma",
        "begin",
        "commit",
        "rollback",
        "vacuum",
        "reindex",
        "replace",
    ]
    if any(f in lowered for f in forbidden):
        raise ValueError(
            "Query contains forbidden keywords; only read-only SELECT is allowed."
        )
    if ";" in s:
        raise ValueError("Multiple statements are not allowed.")
    return s


def execute_select_query(engine: Engine, sql: str, limit: int = 1000) -> Dict[str, Any]:
    """
    Execute a validated SELECT query with automatic LIMIT injection.

    Args:
        engine: SQLAlchemy engine
        sql: SELECT or WITH...SELECT query (will be validated)
        limit: Max rows to return (default 1000, max 10000)

    Returns:
        Dict with rowcount, rows, and documentation
    """
    # Validate the SQL
    s = validate_select_only(sql)

    # Sanitize limit
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 1000
    if limit_val <= 0:
        limit_val = 1000
    if limit_val > 10000:
        limit_val = 10000

    # Check if query already has LIMIT
    has_limit = " limit " in s.lower()
    stmt = text(s if has_limit else f"{s} LIMIT :_limit")
    params = {} if has_limit else {"_limit": limit_val}

    # Execute query
    with engine.connect() as conn:
        rows = conn.execute(stmt, params).fetchall()

    # Convert to dict
    data = [dict(r._mapping) for r in rows]

    return {
        "rowcount": len(data),
        "rows": data,
        "docs": [
            "SQLite has no roles; enforce read-only by opening in mode=ro and PRAGMA query_only=ON.",
            "Block non-SELECT in application layer.",
            "Protect file with OS perms (e.g., chmod 444) and run as non-writer user.",
            "Optionally use a read-only replica refreshed offline.",
        ],
    }
