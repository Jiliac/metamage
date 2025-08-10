import argparse
from datetime import datetime
from typing import Dict, Any

from fastmcp import FastMCP
from sqlalchemy import text, event

from ..models import get_engine

mcp = FastMCP(
    name="MTG Tournament MCP",
    instructions="""
        This server exposes tools and resources for MTG tournament analysis:

        ## Tools
          - query_database(sql, limit): run SELECT-only SQLite queries against the MTG tournament DB
          - get_archetype_winrate(archetype_id, start_date, end_date, exclude_mirror?): compute W/L/D and winrate
          - get_meta_report(format_id, start_date, end_date, limit?): meta report with presence % and winrates
          - get_matchup_winrate(format_id, archetype1_name, archetype2_name, start_date, end_date): head-to-head analysis
          - get_card_presence(format_id, start_date, end_date, board?, limit?): top cards by presence in format
          - get_archetype_cards(format_id, archetype_name, start_date, end_date, board?, limit?): cards in specific archetype
          - get_archetype_trends(format_id, archetype_name, days_back?): weekly presence/winrate trends
          - get_tournament_results(format_id, start_date, end_date, min_players?, limit?): winners and top 8 breakdown

        ## Resources
          - mtg://formats/{format_id}: format overview with recent tournaments and meta snapshot
          - mtg://players/{player_id}: player profile with recent performance and tournament history
          - mtg://archetypes/{archetype_name}: archetype overview with recent performance and key cards

        ## Database Schema
        Tables: formats, players, cards, archetypes, tournaments, tournament_entries, deck_cards, matches, meta_changes

        Key table structures:
        - formats: id (uuid), name (citext)
        - archetypes: id (uuid), format_id (FK), name (citext), color (text)
        - tournaments: id (uuid), name, date (datetime), format_id (FK), source (MTGO|MELEE|OTHER), link
        - tournament_entries: id (uuid), tournament_id (FK), player_id (FK), archetype_id (FK), wins, losses, draws, rank
        - matches: id (uuid), entry_id (FK), opponent_entry_id (FK), result (WIN|LOSS|DRAW), mirror (boolean), pair_id
        - deck_cards: id (uuid), entry_id (FK), card_id (FK), count, board (MAIN|SIDE)
        - cards: id (uuid), name (citext), scryfall_oracle_id
        - players: id (uuid), handle, normalized_handle (citext)
        - meta_changes: id (uuid), format_id (FK), date, change_type (BAN|SET_RELEASE), description, set_code

        Key relationships:
        - matches.entry_id -> tournament_entries.id
        - matches.opponent_entry_id -> tournament_entries.id  
        - tournament_entries.archetype_id -> archetypes.id
        - tournament_entries.tournament_id -> tournaments.id
        - archetypes.format_id -> formats.id
        - deck_cards.entry_id -> tournament_entries.id
        - deck_cards.card_id -> cards.id

        Note: matches table has both sides of each match (entry vs opponent), linked by pair_id.
        To avoid double-counting, filter by entry_id < opponent_entry_id or group by pair_id.

        ## Query Constraints & Usage
        - Only SELECT/WITH (CTE) queries allowed
        - NO PRAGMA, DDL, DML, transactions, or schema introspection commands
        - Tool automatically applies LIMIT parameter - do NOT include LIMIT in your SQL
        - Multiple statements (semicolon-separated) are forbidden
        - All UUIDs are stored as 36-character strings

        ## Common Query Patterns
        - Modern format_id: '402d2a82-3ba6-4369-badf-a51f3eff4375'
        - Legacy format_id: '0f68f9f5-460d-4111-94df-965cf7e4d28c'  
        - Pauper format_id: 'cbf69202-6dc7-4861-849e-859d116e7182'
        - Standard format_id: 'ceff9123-427e-4099-810a-39f57884ec4e'
        - Pioneer format_id: '123dda9e-b157-4bbf-a990-310565cbef7c'
        - Vintage format_id: 'dcf29968-f908-4d2e-90a6-4f158bc767be'

        Read-only hardening:
          - DB opened read-only (mode=ro) and PRAGMA query_only=ON on each connection.
          - Tool-level SQL gate allows only SELECT/CTE; forbids DDL/DML/PRAGMA/transactions.
          - For extra safety, make the DB file read-only (chmod 444) and/or run server as a non-writer user.
          - Optionally use a read-only replica file refreshed out-of-band.
    """,
)


engine = get_engine()


@event.listens_for(engine, "connect")
def _set_ro_pragmas(dbapi_connection, connection_record):
    cur = dbapi_connection.cursor()
    cur.execute("PRAGMA query_only=ON")
    cur.close()


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


@mcp.tool
def query_database(sql: str, limit: int = 1000) -> Dict[str, Any]:
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
def get_meta_report(
    format_id: str, start_date: str, end_date: str, limit: int = 15
) -> Dict[str, Any]:
    """
    Generate meta report showing top archetypes by match presence within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        limit: Maximum archetypes to return (default: 15, max: 20)

    Returns:
        Dict with archetype stats: presence %, winrate (excl. draws), total matches, entries
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except Exception:
        raise ValueError(
            "Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)"
        )
    if end < start:
        raise ValueError("end_date must be >= start_date")

    # Cap limit at 20
    if limit > 20:
        limit = 20

    sql = """
        WITH total_matches AS (
            SELECT COUNT(*) as total_format_matches
            FROM matches m
            JOIN tournament_entries te ON m.entry_id = te.id
            JOIN tournaments t ON te.tournament_id = t.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
            AND m.entry_id < m.opponent_entry_id
        ),
        archetype_stats AS (
            SELECT 
                a.name as archetype_name,
                COUNT(DISTINCT te.id) as total_entries,
                COUNT(DISTINCT t.id) as tournaments_played,
                COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) as total_wins,
                COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END) as total_losses,
                COUNT(CASE WHEN m.result = 'DRAW' THEN 1 END) as total_draws,
                COUNT(*) as total_matches
            FROM matches m
            JOIN tournament_entries te ON m.entry_id = te.id
            JOIN tournaments t ON te.tournament_id = t.id
            JOIN archetypes a ON te.archetype_id = a.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
            AND m.entry_id < m.opponent_entry_id
            GROUP BY a.id, a.name
        )
        SELECT 
            archetype_name,
            total_entries,
            tournaments_played,
            total_wins,
            total_losses,
            total_draws,
            total_matches,
            ROUND(
                CAST(total_matches AS REAL) / 
                CAST((SELECT total_format_matches FROM total_matches) AS REAL) * 100, 2
            ) as presence_percent,
            ROUND(
                CAST(total_wins AS REAL) / 
                CAST((total_wins + total_losses) AS REAL) * 100, 2
            ) as winrate_percent_no_draws
        FROM archetype_stats
        WHERE total_matches > 0
        ORDER BY total_matches DESC
        LIMIT :limit
    """

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {"format_id": format_id, "start": start, "end": end, "limit": limit},
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "archetypes": data,
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
        raise ValueError(
            "Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)"
        )
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
        res = (
            conn.execute(
                text(sql),
                {"arch_id": archetype_id, "start": start, "end": end},
            )
            .mappings()
            .first()
        )

    wins = int(res["wins"]) if res and res["wins"] is not None else 0
    losses = int(res["losses"]) if res and res["losses"] is not None else 0
    draws = int(res["draws"]) if res and res["draws"] is not None else 0
    total = wins + losses + draws
    decisive_games = wins + losses
    winrate = (wins / decisive_games) if decisive_games > 0 else None

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


@mcp.tool
def get_matchup_winrate(
    format_id: str,
    archetype1_name: str,
    archetype2_name: str,
    start_date: str,
    end_date: str,
    exclude_draws: bool = True,
) -> Dict[str, Any]:
    """
    Compute head-to-head winrate between two archetypes within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        archetype1_name: Name of first archetype (case-insensitive)
        archetype2_name: Name of second archetype (case-insensitive)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        exclude_draws: Calculate winrate excluding draws (default: True)

    Returns:
        Dict with matchup stats: wins/losses/draws for archetype1 vs archetype2, winrates
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except Exception:
        raise ValueError(
            "Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)"
        )
    if end < start:
        raise ValueError("end_date must be >= start_date")

    sql = """
        SELECT 
            COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) as arch1_wins,
            COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END) as arch1_losses,
            COUNT(CASE WHEN m.result = 'DRAW' THEN 1 END) as draws,
            COUNT(*) as total_matches
        FROM matches m
        JOIN tournament_entries te ON m.entry_id = te.id
        JOIN tournament_entries opponent_te ON m.opponent_entry_id = opponent_te.id
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        JOIN archetypes opponent_a ON opponent_te.archetype_id = opponent_a.id
        WHERE t.format_id = :format_id
        AND t.date >= :start
        AND t.date <= :end
        AND LOWER(a.name) = LOWER(:arch1_name)
        AND LOWER(opponent_a.name) = LOWER(:arch2_name)
    """

    with engine.connect() as conn:
        res = (
            conn.execute(
                text(sql),
                {
                    "format_id": format_id,
                    "arch1_name": archetype1_name,
                    "arch2_name": archetype2_name,
                    "start": start,
                    "end": end,
                },
            )
            .mappings()
            .first()
        )

    arch1_wins = int(res["arch1_wins"]) if res and res["arch1_wins"] is not None else 0
    arch1_losses = (
        int(res["arch1_losses"]) if res and res["arch1_losses"] is not None else 0
    )
    draws = int(res["draws"]) if res and res["draws"] is not None else 0
    total_matches = (
        int(res["total_matches"]) if res and res["total_matches"] is not None else 0
    )

    # Calculate winrates
    winrate_with_draws = (
        (arch1_wins / total_matches * 100) if total_matches > 0 else None
    )
    decisive_matches = arch1_wins + arch1_losses
    winrate_no_draws = (
        (arch1_wins / decisive_matches * 100) if decisive_matches > 0 else None
    )

    return {
        "format_id": format_id,
        "archetype1_name": archetype1_name,
        "archetype2_name": archetype2_name,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "arch1_wins": arch1_wins,
        "arch1_losses": arch1_losses,
        "draws": draws,
        "total_matches": total_matches,
        "decisive_matches": decisive_matches,
        "winrate_with_draws": round(winrate_with_draws, 2)
        if winrate_with_draws is not None
        else None,
        "winrate_no_draws": round(winrate_no_draws, 2)
        if winrate_no_draws is not None
        else None,
    }


@mcp.tool
def get_card_presence(
    format_id: str,
    start_date: str,
    end_date: str,
    board: str = "MAIN",
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Get top cards by presence in format within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        board: Card board location - 'MAIN' or 'SIDE' (default: MAIN)
        limit: Maximum cards to return (default: 20)

    Returns:
        Dict with card stats: name, total copies, decks playing, average copies, presence %
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except Exception:
        raise ValueError(
            "Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)"
        )
    if end < start:
        raise ValueError("end_date must be >= start_date")

    if board not in ["MAIN", "SIDE"]:
        raise ValueError("board must be 'MAIN' or 'SIDE'")

    sql = """
        WITH total_decks AS (
            SELECT COUNT(DISTINCT te.id) as total_format_decks
            FROM tournament_entries te
            JOIN tournaments t ON te.tournament_id = t.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
        ),
        card_stats AS (
            SELECT 
                c.name as card_name,
                SUM(dc.count) as total_copies,
                COUNT(DISTINCT te.id) as decks_playing,
                ROUND(AVG(CAST(dc.count AS REAL)), 2) as avg_copies_per_deck
            FROM deck_cards dc
            JOIN cards c ON dc.card_id = c.id
            JOIN tournament_entries te ON dc.entry_id = te.id
            JOIN tournaments t ON te.tournament_id = t.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
            AND dc.board = :board
            GROUP BY c.id, c.name
        )
        SELECT 
            card_name,
            total_copies,
            decks_playing,
            avg_copies_per_deck,
            ROUND(
                CAST(decks_playing AS REAL) / 
                CAST((SELECT total_format_decks FROM total_decks) AS REAL) * 100, 2
            ) as presence_percent
        FROM card_stats
        WHERE decks_playing > 0
        ORDER BY decks_playing DESC, total_copies DESC
        LIMIT :limit
    """

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {
                "format_id": format_id,
                "start": start,
                "end": end,
                "board": board,
                "limit": limit,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "board": board,
        "cards": data,
    }


@mcp.tool
def get_archetype_cards(
    format_id: str,
    archetype_name: str,
    start_date: str,
    end_date: str,
    board: str = "MAIN",
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Get top cards in specific archetype within date range.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        archetype_name: Name of archetype (case-insensitive)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        board: Card board location - 'MAIN' or 'SIDE' (default: MAIN)
        limit: Maximum cards to return (default: 20)

    Returns:
        Dict with card stats: name, total copies, decks playing, average copies, presence %
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except Exception:
        raise ValueError(
            "Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)"
        )
    if end < start:
        raise ValueError("end_date must be >= start_date")

    if board not in ["MAIN", "SIDE"]:
        raise ValueError("board must be 'MAIN' or 'SIDE'")

    sql = """
        WITH archetype_decks AS (
            SELECT COUNT(DISTINCT te.id) as total_archetype_decks
            FROM tournament_entries te
            JOIN tournaments t ON te.tournament_id = t.id
            JOIN archetypes a ON te.archetype_id = a.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
            AND LOWER(a.name) = LOWER(:archetype_name)
        ),
        card_stats AS (
            SELECT 
                c.name as card_name,
                SUM(dc.count) as total_copies,
                COUNT(DISTINCT te.id) as decks_playing,
                ROUND(AVG(CAST(dc.count AS REAL)), 2) as avg_copies_per_deck
            FROM deck_cards dc
            JOIN cards c ON dc.card_id = c.id
            JOIN tournament_entries te ON dc.entry_id = te.id
            JOIN tournaments t ON te.tournament_id = t.id
            JOIN archetypes a ON te.archetype_id = a.id
            WHERE t.format_id = :format_id
            AND t.date >= :start
            AND t.date <= :end
            AND LOWER(a.name) = LOWER(:archetype_name)
            AND dc.board = :board
            GROUP BY c.id, c.name
        )
        SELECT 
            card_name,
            total_copies,
            decks_playing,
            avg_copies_per_deck,
            ROUND(
                CAST(decks_playing AS REAL) / 
                CAST((SELECT total_archetype_decks FROM archetype_decks) AS REAL) * 100, 2
            ) as presence_percent
        FROM card_stats
        WHERE decks_playing > 0
        ORDER BY decks_playing DESC, total_copies DESC
        LIMIT :limit
    """

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {
                "format_id": format_id,
                "archetype_name": archetype_name,
                "start": start,
                "end": end,
                "board": board,
                "limit": limit,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "archetype_name": archetype_name,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "board": board,
        "cards": data,
    }


@mcp.resource("mtg://formats/{format_id}")
def get_format_resource(format_id: str) -> str:
    """
    Get format overview with recent tournaments and meta snapshot.
    """
    sql = """
        SELECT 
            f.name as format_name,
            COUNT(DISTINCT t.id) as recent_tournaments,
            COUNT(DISTINCT te.id) as recent_entries,
            MIN(t.date) as earliest_tournament,
            MAX(t.date) as latest_tournament
        FROM formats f
        LEFT JOIN tournaments t ON f.id = t.format_id AND t.date >= date('now', '-30 days')
        LEFT JOIN tournament_entries te ON t.id = te.tournament_id
        WHERE f.id = :format_id
        GROUP BY f.id, f.name
    """

    with engine.connect() as conn:
        format_info = (
            conn.execute(text(sql), {"format_id": format_id}).mappings().first()
        )

    if not format_info:
        return f"Format {format_id} not found"

    # Get top 5 recent archetypes
    meta_sql = """
        SELECT 
            a.name as archetype_name,
            COUNT(DISTINCT te.id) as entries,
            ROUND(
                CAST(COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) AS REAL) / 
                CAST((COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) + COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END)) AS REAL) * 100, 1
            ) as winrate_no_draws
        FROM tournament_entries te
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        LEFT JOIN matches m ON te.id = m.entry_id AND m.entry_id < m.opponent_entry_id
        WHERE t.format_id = :format_id
        AND t.date >= date('now', '-30 days')
        GROUP BY a.id, a.name
        ORDER BY entries DESC
        LIMIT 5
    """

    with engine.connect() as conn:
        meta_rows = conn.execute(text(meta_sql), {"format_id": format_id}).fetchall()

    meta_summary = "\n".join(
        [
            f"  {row.archetype_name}: {row.entries} entries ({row.winrate_no_draws}% WR)"
            for row in meta_rows
        ]
    )

    return f"""# {format_info["format_name"]} Format Overview

## Recent Activity (Last 30 Days)
- **Tournaments**: {format_info["recent_tournaments"] or 0}
- **Total Entries**: {format_info["recent_entries"] or 0}
- **Date Range**: {format_info["earliest_tournament"] or "N/A"} to {format_info["latest_tournament"] or "N/A"}

## Top Meta Archetypes
{meta_summary or "No recent data available"}

*Use mtg://archetypes/[name] for detailed archetype information*
"""


@mcp.resource("mtg://players/{player_id}")
def get_player_resource(player_id: str) -> str:
    """
    Get player profile with recent tournament entries and performance.
    """
    sql = """
        SELECT 
            p.handle,
            COUNT(DISTINCT te.id) as total_entries,
            COUNT(DISTINCT t.id) as tournaments_played,
            AVG(te.wins + te.losses + te.draws) as avg_rounds,
            MAX(t.date) as last_tournament
        FROM players p
        LEFT JOIN tournament_entries te ON p.id = te.player_id
        LEFT JOIN tournaments t ON te.tournament_id = t.id
        WHERE p.id = :player_id
        AND t.date >= date('now', '-90 days')
        GROUP BY p.id, p.handle
    """

    with engine.connect() as conn:
        player_info = (
            conn.execute(text(sql), {"player_id": player_id}).mappings().first()
        )

    if not player_info:
        return f"Player {player_id} not found"

    # Get recent results
    results_sql = """
        SELECT 
            t.name as tournament_name,
            t.date,
            a.name as archetype_name,
            te.wins,
            te.losses,
            te.draws,
            te.rank
        FROM tournament_entries te
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        WHERE te.player_id = :player_id
        AND t.date >= date('now', '-90 days')
        ORDER BY t.date DESC
        LIMIT 5
    """

    with engine.connect() as conn:
        results = conn.execute(text(results_sql), {"player_id": player_id}).fetchall()

    results_summary = "\n".join(
        [
            f"  {r.tournament_name} ({r.date}): {r.archetype_name} - {r.wins}-{r.losses}-{r.draws} (Rank {r.rank or 'N/A'})"
            for r in results
        ]
    )

    return f"""# Player: {player_info["handle"]}

## Recent Performance (Last 90 Days)
- **Tournaments**: {player_info["tournaments_played"] or 0}
- **Total Entries**: {player_info["total_entries"] or 0}
- **Avg Rounds**: {round(player_info["avg_rounds"] or 0, 1)}
- **Last Seen**: {player_info["last_tournament"] or "N/A"}

## Recent Results
{results_summary or "No recent tournament data"}
"""


@mcp.resource("mtg://archetypes/{archetype_name}")
def get_archetype_resource(archetype_name: str) -> str:
    """
    Get archetype overview with recent performance and key cards.
    """
    # Get archetype info with recent performance
    sql = """
        SELECT 
            a.name as archetype_name,
            f.name as format_name,
            COUNT(DISTINCT te.id) as recent_entries,
            COUNT(DISTINCT t.id) as tournaments_played,
            ROUND(
                CAST(COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) AS REAL) / 
                CAST((COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) + COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END)) AS REAL) * 100, 1
            ) as winrate_no_draws
        FROM archetypes a
        JOIN formats f ON a.format_id = f.id
        LEFT JOIN tournament_entries te ON a.id = te.archetype_id
        LEFT JOIN tournaments t ON te.tournament_id = t.id AND t.date >= date('now', '-30 days')
        LEFT JOIN matches m ON te.id = m.entry_id AND m.entry_id < m.opponent_entry_id
        WHERE LOWER(a.name) = LOWER(:archetype_name)
        GROUP BY a.id, a.name, f.name
    """

    with engine.connect() as conn:
        arch_info = (
            conn.execute(text(sql), {"archetype_name": archetype_name})
            .mappings()
            .first()
        )

    if not arch_info:
        return f"Archetype '{archetype_name}' not found"

    # Get top cards
    cards_sql = """
        SELECT 
            c.name as card_name,
            COUNT(DISTINCT te.id) as decks_playing,
            ROUND(AVG(CAST(dc.count AS REAL)), 1) as avg_copies
        FROM deck_cards dc
        JOIN cards c ON dc.card_id = c.id
        JOIN tournament_entries te ON dc.entry_id = te.id
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        WHERE LOWER(a.name) = LOWER(:archetype_name)
        AND t.date >= date('now', '-30 days')
        AND dc.board = 'MAIN'
        GROUP BY c.id, c.name
        ORDER BY decks_playing DESC
        LIMIT 8
    """

    with engine.connect() as conn:
        cards = conn.execute(
            text(cards_sql), {"archetype_name": archetype_name}
        ).fetchall()

    cards_summary = "\n".join(
        [
            f"  {c.card_name}: {c.avg_copies} avg copies ({c.decks_playing} decks)"
            for c in cards
        ]
    )

    return f"""# Archetype: {arch_info["archetype_name"]}

## Format & Recent Performance (Last 30 Days)
- **Format**: {arch_info["format_name"]}
- **Tournament Entries**: {arch_info["recent_entries"] or 0}
- **Tournaments**: {arch_info["tournaments_played"] or 0}
- **Winrate**: {arch_info["winrate_no_draws"] or "N/A"}%

## Key Cards (Main Deck)
{cards_summary or "No recent deck data available"}

*Use get_archetype_cards() for complete card analysis*
"""


@mcp.tool
def get_archetype_trends(
    format_id: str,
    archetype_name: str,
    days_back: int = 30,
) -> Dict[str, Any]:
    """
    Get weekly presence and winrate trends for an archetype over time.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        archetype_name: Name of archetype (case-insensitive)
        days_back: Number of days to look back (default: 30)

    Returns:
        Dict with weekly trend data: dates, entries, matches, winrates
    """
    try:
        days_back = int(days_back)
        if days_back <= 0 or days_back > 365:
            raise ValueError("days_back must be between 1 and 365")
    except (ValueError, TypeError):
        raise ValueError("days_back must be a valid integer between 1 and 365")

    sql = """
        WITH weeks AS (
            SELECT 
                date(t.date, 'weekday 0', '-6 days') as week_start,
                date(t.date, 'weekday 0') as week_end,
                COUNT(DISTINCT te.id) as entries,
                COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) as wins,
                COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END) as losses,
                COUNT(CASE WHEN m.result = 'DRAW' THEN 1 END) as draws,
                COUNT(*) as total_matches
            FROM tournaments t
            JOIN tournament_entries te ON t.id = te.tournament_id
            JOIN archetypes a ON te.archetype_id = a.id
            LEFT JOIN matches m ON te.id = m.entry_id AND m.entry_id < m.opponent_entry_id
            WHERE t.format_id = :format_id
            AND LOWER(a.name) = LOWER(:archetype_name)
            AND t.date >= date('now', '-{} days')
            GROUP BY week_start, week_end
        ),
        total_per_week AS (
            SELECT 
                date(t.date, 'weekday 0', '-6 days') as week_start,
                COUNT(DISTINCT te.id) as total_format_entries
            FROM tournaments t
            JOIN tournament_entries te ON t.id = te.tournament_id
            WHERE t.format_id = :format_id
            AND t.date >= date('now', '-{} days')
            GROUP BY week_start
        )
        SELECT 
            w.week_start,
            w.week_end,
            w.entries,
            w.total_matches,
            w.wins,
            w.losses,
            w.draws,
            ROUND(
                CAST(w.entries AS REAL) / 
                CAST(tpw.total_format_entries AS REAL) * 100, 2
            ) as presence_percent,
            ROUND(
                CAST(w.wins AS REAL) / 
                CAST((w.wins + w.losses) AS REAL) * 100, 2
            ) as winrate_no_draws
        FROM weeks w
        LEFT JOIN total_per_week tpw ON w.week_start = tpw.week_start
        ORDER BY w.week_start
    """.format(days_back, days_back)

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {
                "format_id": format_id,
                "archetype_name": archetype_name,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "archetype_name": archetype_name,
        "days_back": days_back,
        "weekly_trends": data,
    }


@mcp.tool
def get_tournament_results(
    format_id: str,
    start_date: str,
    end_date: str,
    min_players: int = 32,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Get tournament winners and top 8 breakdown by archetype.

    Args:
        format_id: Format UUID (e.g., '402d2a82-3ba6-4369-badf-a51f3eff4375' for Modern)
        start_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        end_date: ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        min_players: Minimum tournament size to include (default: 32)
        limit: Maximum tournaments to return (default: 20)

    Returns:
        Dict with tournament results: winners, top 8 meta breakdown
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except Exception:
        raise ValueError(
            "Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)"
        )
    if end < start:
        raise ValueError("end_date must be >= start_date")

    # Get tournament winners
    winners_sql = """
        SELECT 
            t.name as tournament_name,
            t.date,
            t.link,
            a.name as winning_archetype,
            p.handle as winner_handle,
            COUNT(DISTINCT all_te.id) as tournament_size
        FROM tournaments t
        JOIN tournament_entries te ON t.id = te.tournament_id AND te.rank = 1
        JOIN archetypes a ON te.archetype_id = a.id
        JOIN players p ON te.player_id = p.id
        JOIN tournament_entries all_te ON t.id = all_te.tournament_id
        WHERE t.format_id = :format_id
        AND t.date >= :start
        AND t.date <= :end
        GROUP BY t.id, t.name, t.date, t.link, a.name, p.handle
        HAVING tournament_size >= :min_players
        ORDER BY t.date DESC
        LIMIT :limit
    """

    with engine.connect() as conn:
        winners = conn.execute(
            text(winners_sql),
            {
                "format_id": format_id,
                "start": start,
                "end": end,
                "min_players": min_players,
                "limit": limit,
            },
        ).fetchall()

    # Get top 8 meta breakdown
    top8_sql = """
        SELECT 
            a.name as archetype_name,
            COUNT(*) as top8_appearances,
            COUNT(CASE WHEN te.rank = 1 THEN 1 END) as wins,
            ROUND(
                CAST(COUNT(*) AS REAL) / 
                (SELECT COUNT(*) 
                 FROM tournament_entries te2 
                 JOIN tournaments t2 ON te2.tournament_id = t2.id 
                 WHERE t2.format_id = :format_id 
                 AND t2.date >= :start 
                 AND t2.date <= :end 
                 AND te2.rank <= 8) * 100, 2
            ) as top8_meta_share
        FROM tournament_entries te
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        WHERE t.format_id = :format_id
        AND t.date >= :start
        AND t.date <= :end
        AND te.rank <= 8
        AND t.id IN (
            SELECT t3.id 
            FROM tournaments t3 
            JOIN tournament_entries te3 ON t3.id = te3.tournament_id 
            GROUP BY t3.id 
            HAVING COUNT(DISTINCT te3.id) >= :min_players
        )
        GROUP BY a.id, a.name
        ORDER BY top8_appearances DESC
    """

    with engine.connect() as conn:
        top8_meta = conn.execute(
            text(top8_sql),
            {
                "format_id": format_id,
                "start": start,
                "end": end,
                "min_players": min_players,
            },
        ).fetchall()

    winners_data = [dict(r._mapping) for r in winners]
    top8_data = [dict(r._mapping) for r in top8_meta]

    return {
        "format_id": format_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "min_players": min_players,
        "tournament_winners": winners_data,
        "top8_meta_breakdown": top8_data,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MTG Tournament MCP Server")
    parser.add_argument(
        "--stdio",
        action="store_true",
        help="Run the MCP server over stdio transport (default for Claude Desktop).",
    )
    parser.add_argument(
        "--http",
        action="store_true",
        help="Run the MCP server over HTTP transport.",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host for HTTP server (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9000,
        help="Port for HTTP server (default: 9000).",
    )
    args = parser.parse_args()

    if args.http:
        mcp.run(transport="http", host=args.host, port=args.port)
    else:
        # Default to stdio for Claude Desktop compatibility
        mcp.run(transport="stdio")
