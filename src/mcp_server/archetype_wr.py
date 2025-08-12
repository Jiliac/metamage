from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text

from .utils import engine
from .mcp import mcp


@mcp.tool
def get_archetype_winrate(
    archetype_id: str,
    start_date: str,
    end_date: str,
    exclude_mirror: bool = True,
) -> Dict[str, Any]:
    """
    Compute wins/losses/draws and winrate (excluding draws) for a given archetype_id within [start_date, end_date].
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
