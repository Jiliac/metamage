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
        - DateTime fields store full timestamps (e.g., '2025-08-18 01:00:00.000000')
          Use date ranges: t.date >= '2025-08-18' AND t.date < '2025-08-19'
          NOT equality: t.date = '2025-08-18' (will not match)

    SQLite read-only hardening cheat sheet:
      - Connection: open with URI mode=ro and set PRAGMA query_only=ON.
      - Tool: restrict to SELECT/CTE; block PRAGMA/DDL/DML/transactions.
      - Filesystem: chmod 444 data/tournament.db (read-only) and run under a non-writer user.
      - Ops: optionally serve a read-only replica DB and refresh it offline.

    Workflow Integration:
      - Use IDs from search_card() (card_id) and get_archetype_overview() (archetype_id) to drive custom analyses.
      - Validate summaries from get_meta_report(), get_card_presence(), and get_archetype_winrate() with direct SQL.
      - Combine with get_sources() to fetch links that support your findings.

    Common Templates (describe, then implement with your own SQL):
      - Card adoption in an archetype and performance split (with vs without a card).
      - Matchup performance for a specific archetype over a period.
      - Entry-level aggregates by player, tournament size, or source.
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
