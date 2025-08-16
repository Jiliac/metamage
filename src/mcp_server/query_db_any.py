from typing import Dict, Any
from sqlalchemy import text
from fastmcp import Context

from .utils import validate_select_only
from .utils import engine
from .mcp import mcp
from .log_decorator import log_tool_calls


@mcp.tool
@log_tool_calls
def query_database(sql: str, limit: int = 1000, ctx: Context = None) -> Dict[str, Any]:
    """
    Execute a SELECT-only SQL query against the tournament DB.

    Args:
        sql: SELECT or WITH...SELECT query (do NOT include LIMIT clause)
        limit: Maximum rows to return (default: 1000, max: 10000)

    Returns:
        Dict with 'rowcount', 'rows' (list of dicts), and 'docs' fields

    Important:
        - Do NOT include LIMIT in your SQL - it's added automatically
        - Only SELECT/WITH queries allowed (no PRAGMA, DDL, DML, etc.)
        - All UUIDs stored as 36-character strings
        - Use proper JOIN syntax for relationships (see schema in instructions)

    SQLite read-only hardening cheat sheet:
      - Connection: open with URI mode=ro and set PRAGMA query_only=ON.
      - Tool: restrict to SELECT/CTE; block PRAGMA/DDL/DML/transactions.
      - Filesystem: chmod 444 data/tournament.db (read-only) and run under a non-writer user.
      - Ops: optionally serve a read-only replica DB and refresh it offline.
    """
    s = validate_select_only(sql)
    # Add LIMIT if none present (simple guard)
    has_limit = " limit " in s.lower()
    stmt = text(s if has_limit else f"{s} LIMIT :_limit")
    with engine.connect() as conn:
        rows = conn.execute(stmt, {"_limit": limit}).fetchall()
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
