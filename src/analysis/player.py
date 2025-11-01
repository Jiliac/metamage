from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.engine import Engine


def _find_player_fuzzy(engine: Engine, player_handle: str) -> Optional[Dict[str, Any]]:
    """Find player using fuzzy matching on handle/normalized_handle."""
    # Exact match on normalized_handle
    exact_sql = """
        SELECT id, handle, normalized_handle
        FROM players
        WHERE normalized_handle = LOWER(:player_handle)
    """
    with engine.connect() as conn:
        result = conn.execute(text(exact_sql), {"player_handle": player_handle}).first()
        if result:
            return dict(result._mapping)

    # Partial match on handle
    partial_sql = """
        SELECT id, handle, normalized_handle
        FROM players
        WHERE LOWER(handle) LIKE LOWER(:pattern)
        ORDER BY LENGTH(handle)
        LIMIT 1
    """
    with engine.connect() as conn:
        pattern = f"%{player_handle}%"
        result = conn.execute(text(partial_sql), {"pattern": pattern}).first()
        if result:
            return dict(result._mapping)

    # Partial match on normalized_handle
    normalized_partial_sql = """
        SELECT id, handle, normalized_handle
        FROM players
        WHERE normalized_handle LIKE LOWER(:pattern)
        ORDER BY LENGTH(handle)
        LIMIT 1
    """
    with engine.connect() as conn:
        pattern = f"%{player_handle.lower()}%"
        result = conn.execute(
            text(normalized_partial_sql), {"pattern": pattern}
        ).first()
        if result:
            return dict(result._mapping)

    return None


def compute_player_profile(engine: Engine, player_id_or_handle: str) -> Dict[str, Any]:
    """
    Compute player profile with recent tournament performance and latest results.
    Accepts either a player UUID or a handle (with fuzzy matching).
    """
    # Determine if input is a UUID (36 chars with 4 dashes)
    actual_player_id = player_id_or_handle
    if len(player_id_or_handle) != 36 or player_id_or_handle.count("-") != 4:
        match = _find_player_fuzzy(engine, player_id_or_handle)
        if not match:
            return {
                "error": f"Player '{player_id_or_handle}' not found. Try a different name or check spelling."
            }
        actual_player_id = match["id"]

    cutoff = datetime.utcnow() - timedelta(days=90)

    # Aggregate recent performance
    perf_sql = """
        SELECT
            p.handle AS handle,
            COUNT(DISTINCT te.id) AS total_entries,
            COUNT(DISTINCT t.id) AS tournaments_played,
            AVG(COALESCE(te.wins, 0) + COALESCE(te.losses, 0) + COALESCE(te.draws, 0)) AS avg_rounds,
            MAX(t.date) AS last_tournament
        FROM players p
        LEFT JOIN tournament_entries te ON p.id = te.player_id
        LEFT JOIN tournaments t ON te.tournament_id = t.id
        WHERE p.id = :player_id
          AND t.date >= :cutoff
        GROUP BY p.id, p.handle
        LIMIT 1
    """
    with engine.connect() as conn:
        row = (
            conn.execute(
                text(perf_sql), {"player_id": actual_player_id, "cutoff": cutoff}
            )
            .mappings()
            .first()
        )

    if not row:
        return {"error": f"Player {actual_player_id} not found"}

    handle = row["handle"]
    total_entries = int(row["total_entries"]) if row["total_entries"] is not None else 0
    tournaments_played = (
        int(row["tournaments_played"]) if row["tournaments_played"] is not None else 0
    )
    avg_rounds = float(row["avg_rounds"]) if row["avg_rounds"] is not None else 0.0
    last_tournament = row["last_tournament"]
    last_tournament_str = str(last_tournament) if last_tournament is not None else None

    # Recent results (last 5)
    recent_sql = """
        SELECT
            t.name AS tournament_name,
            t.date AS date,
            t.link AS tournament_link,
            a.name AS archetype_name,
            te.wins,
            te.losses,
            te.draws,
            te.rank
        FROM tournament_entries te
        JOIN tournaments t ON te.tournament_id = t.id
        JOIN archetypes a ON te.archetype_id = a.id
        WHERE te.player_id = :player_id
          AND t.date >= :cutoff
        ORDER BY t.date DESC
        LIMIT 5
    """
    with engine.connect() as conn:
        results = conn.execute(
            text(recent_sql), {"player_id": actual_player_id, "cutoff": cutoff}
        ).fetchall()

    recent_results = [
        {
            "tournament_name": r.tournament_name,
            "date": str(r.date),
            "tournament_link": r.tournament_link,
            "archetype_name": r.archetype_name,
            "wins": r.wins,
            "losses": r.losses,
            "draws": r.draws,
            "rank": r.rank,
        }
        for r in results
    ]

    return {
        "player_id": actual_player_id,
        "handle": handle,
        "recent_performance": {
            "period_days": 90,
            "tournaments_played": tournaments_played,
            "total_entries": total_entries,
            "avg_rounds": round(avg_rounds or 0, 1),
            "last_tournament": last_tournament_str,
        },
        "recent_results": recent_results,
    }
