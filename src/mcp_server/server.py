import os
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

from fastmcp import FastMCP
from sqlalchemy import create_engine, text, event
from sqlalchemy.engine import Engine

from models import get_database_path

mcp = FastMCP(
    name="MTG Tournament MCP",
    instructions="""
        This server exposes:
          - query_database(sql, limit): run SELECT-only SQLite queries against the MTG tournament DB.
          - get_archetype_winrate(archetype_id, start_date, end_date, exclude_mirror?): compute W/L/D and winrate.

        Read-only hardening:
          - DB opened read-only (mode=ro) and PRAGMA query_only=ON on each connection.
          - Tool-level SQL gate allows only SELECT/CTE; forbids DDL/DML/PRAGMA/transactions.
          - For extra safety, make the DB file read-only (chmod 444) and/or run server as a non-writer user.
          - Optionally use a read-only replica file refreshed out-of-band.
    """,
)

def create_readonly_engine() -> Engine:
    """
    Open SQLite in read-only mode and enforce query_only=ON.
    """
    db_path = Path(get_database_path()).resolve()
    # SQLite URI with mode=ro; SQLAlchemy needs uri=True in connect args
    uri = f"file:{db_path.as_posix()}?mode=ro&cache=shared"
    engine = create_engine(
        f"sqlite+pysqlite:///{uri}",
        connect_args={"uri": True, "check_same_thread": False, "timeout": 5},
        pool_pre_ping=True,
    )

    @event.listens_for(engine, "connect")
    def _set_ro_pragmas(dbapi_connection, connection_record):
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA query_only=ON")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    return engine

engine = create_readonly_engine()

def _validate_select_only(sql: str) -> str:
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
        "insert", "update", "delete", "alter", "drop", "create",
        "attach", "detach", "pragma", "begin", "commit", "rollback",
        "vacuum", "reindex", "replace",
    ]
    if any(f in lowered for f in forbidden):
        raise ValueError("Query contains forbidden keywords; only read-only SELECT is allowed.")
    if ";" in s:
        raise ValueError("Multiple statements are not allowed.")
    return s

@mcp.tool
def query_database(sql: str, limit: int = 1000) -> Dict[str, Any]:
    """
    Execute a SELECT-only SQL query against the tournament DB.

    SQLite read-only hardening cheat sheet:
      - Connection: open with URI mode=ro and set PRAGMA query_only=ON.
      - Tool: restrict to SELECT/CTE; block PRAGMA/DDL/DML/transactions.
      - Filesystem: chmod 444 data/tournament.db (read-only) and run under a non-writer user.
      - Ops: optionally serve a read-only replica DB and refresh it offline.
    """
    s = _validate_select_only(sql)
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

@mcp.tool
def get_archetype_winrate(
    archetype_id: str,
    start_date: str,
    end_date: str,
    exclude_mirror: bool = True,
) -> Dict[str, Any]:
    """
    Compute wins/losses/draws and winrate for a given archetype_id within [start_date, end_date].
    Dates must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except Exception:
        raise ValueError("Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)")
    if end < start:
        raise ValueError("end_date must be >= start_date")

    sql = """
        SELECT
          COALESCE(SUM(CASE WHEN m.result = 'WIN'  THEN 1 ELSE 0 END), 0) AS wins,
          COALESCE(SUM(CASE WHEN m.result = 'LOSS' THEN 1 ELSE 0 END), 0) AS losses,
          COALESCE(SUM(CASE WHEN m.result = 'DRAW' THEN 1 ELSE 0 END), 0) AS draws
        FROM matches m
        JOIN tournament_entries e ON e.id = m.entry_id
        JOIN tournaments t ON t.id = e.tournament_id
        WHERE e.archetype_id = :arch_id
          AND t.date >= :start
          AND t.date <= :end
    """
    if exclude_mirror:
        sql += " AND m.mirror = 0"

    with engine.connect() as conn:
        res = conn.execute(
            text(sql),
            {"arch_id": archetype_id, "start": start, "end": end},
        ).mappings().first()

    wins = int(res["wins"]) if res and res["wins"] is not None else 0
    losses = int(res["losses"]) if res and res["losses"] is not None else 0
    draws = int(res["draws"]) if res and res["draws"] is not None else 0
    total = wins + losses + draws
    winrate = (wins / total) if total > 0 else None

    return {
        "archetype_id": archetype_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "exclude_mirror": exclude_mirror,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "matches": total,
        "winrate": winrate,
    }

if __name__ == "__main__":
    host = os.getenv("MCP_HOST", "127.0.0.1")
    port = int(os.getenv("MCP_PORT", "9000"))
    mcp.run(transport="http", host=host, port=port)
