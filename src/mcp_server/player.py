from datetime import datetime, timedelta
from typing import Dict, Any
from sqlalchemy import func, distinct, text

from .utils import get_session, engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..models import Player, TournamentEntry, Tournament, Archetype


def _find_player_fuzzy(player_handle: str):
    """Find player using fuzzy matching with fallback strategies."""

    # Strategy 1: Exact match (case-insensitive) using normalized_handle
    exact_sql = """
        SELECT id, handle, normalized_handle
        FROM players
        WHERE normalized_handle = LOWER(:player_handle)
    """

    with engine.connect() as conn:
        result = conn.execute(text(exact_sql), {"player_handle": player_handle}).first()
        if result:
            return result._mapping

    # Strategy 2: Partial match on handle (contains)
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
            return result._mapping

    # Strategy 3: Partial match on normalized_handle (contains)
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
            return result._mapping

    return None


def _get_player_profile(player_id_or_handle: str) -> Dict[str, Any]:
    """
    Internal helper for get_player; not a tool and not logged.
    """
    # Try to determine if input is a UUID or handle
    actual_player_id = player_id_or_handle

    # If it doesn't look like a UUID (36 chars with dashes), treat as handle
    if len(player_id_or_handle) != 36 or player_id_or_handle.count("-") != 4:
        player_match = _find_player_fuzzy(player_id_or_handle)
        if not player_match:
            return {
                "error": f"Player '{player_id_or_handle}' not found. Try a different name or check spelling."
            }
        actual_player_id = player_match["id"]

    cutoff = datetime.utcnow() - timedelta(days=90)
    with get_session() as session:
        player_info = (
            session.query(
                Player.handle.label("handle"),
                func.count(distinct(TournamentEntry.id)).label("total_entries"),
                func.count(distinct(Tournament.id)).label("tournaments_played"),
                func.avg(
                    TournamentEntry.wins
                    + TournamentEntry.losses
                    + TournamentEntry.draws
                ).label("avg_rounds"),
                func.max(Tournament.date).label("last_tournament"),
            )
            .outerjoin(TournamentEntry, Player.id == TournamentEntry.player_id)
            .outerjoin(Tournament, TournamentEntry.tournament_id == Tournament.id)
            .filter(Player.id == actual_player_id, Tournament.date >= cutoff)
            .group_by(Player.id, Player.handle)
            .first()
        )

    if not player_info:
        return {"error": f"Player {actual_player_id} not found"}

    # Normalize mapping access
    player_info = dict(player_info._mapping)

    # Get recent results
    with get_session() as session:
        results = (
            session.query(
                Tournament.name.label("tournament_name"),
                Tournament.date.label("date"),
                Tournament.link.label("tournament_link"),
                Archetype.name.label("archetype_name"),
                TournamentEntry.wins,
                TournamentEntry.losses,
                TournamentEntry.draws,
                TournamentEntry.rank,
            )
            .join(Tournament, TournamentEntry.tournament_id == Tournament.id)
            .join(Archetype, TournamentEntry.archetype_id == Archetype.id)
            .filter(
                TournamentEntry.player_id == actual_player_id, Tournament.date >= cutoff
            )
            .order_by(Tournament.date.desc())
            .limit(5)
            .all()
        )

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
        "handle": player_info["handle"],
        "recent_performance": {
            "period_days": 90,
            "tournaments_played": player_info["tournaments_played"] or 0,
            "total_entries": player_info["total_entries"] or 0,
            "avg_rounds": round(player_info["avg_rounds"] or 0, 1),
            "last_tournament": str(player_info["last_tournament"])
            if player_info["last_tournament"]
            else None,
        },
        "recent_results": recent_results,
    }


@log_tool_calls
@mcp.tool
def get_player(player_id_or_handle: str, ctx: Context = None) -> Dict[str, Any]:
    """
    Get player profile with recent tournament entries and performance.
    Accepts either a player UUID or player handle (with fuzzy matching).

    Returns structured data including:
    - player_id, handle
    - recent_performance: tournaments_played, total_entries, avg_rounds, last_tournament
    - recent_results: list of recent tournament results with archetype, record, and rank

    Workflow Integration:
    - Use get_sources() to gather recent tournaments for the formats a player competes in.
    - For deeper stats (e.g., per-archetype breakdown), use query_database() with the returned player_id.

    Related Tools:
    - get_sources(), query_database(), get_archetype_overview()

    Example:
    - Identify the player's primary archetypes over the last N days with a custom query in query_database()
      joining tournament_entries, tournaments, and archetypes by player_id.
    """
    return _get_player_profile(player_id_or_handle)
