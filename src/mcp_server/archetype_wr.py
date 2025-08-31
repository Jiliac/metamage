from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text
from fastmcp import Context

from .utils import engine
from .mcp import mcp
from .log_decorator import log_tool_calls


@mcp.tool
@log_tool_calls
def get_archetype_winrate(
    archetype_id: str,
    start_date: str,
    end_date: str,
    exclude_mirror: bool = True,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Compute wins/losses/draws and winrate (excluding draws) for a given archetype_id within [start_date, end_date].
    Dates must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).

    Workflow Integration:
    - Resolve archetype_id via get_archetype_overview() when starting from a name.
    - Compare with format context via get_meta_report() or time-slice using get_archetype_trends().
    - For matchup-specific rates, use get_matchup_winrate().

    Related Tools:
    - get_archetype_overview(), get_meta_report(), get_archetype_trends(), get_matchup_winrate(), query_database()

    Example:
    1) arch = get_archetype_overview("Rakdos Scam") → pick ID
    2) wr = get_archetype_winrate(arch.id, "2025-01-01", "2025-06-30", exclude_mirror=True)
    3) If needed, validate specific slices with query_database() using the same date bounds.
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
          COALESCE(SUM(CASE WHEN m.result = 'DRAW' THEN 1 ELSE 0 END), 0) AS draws,
          MAX(a.name) AS archetype_name
        FROM matches m
        JOIN tournament_entries e ON e.id = m.entry_id
        JOIN tournaments t ON t.id = e.tournament_id
        JOIN archetypes a ON e.archetype_id = a.id
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
    archetype_name = (
        res["archetype_name"] if res and res["archetype_name"] is not None else None
    )
    total = wins + losses + draws
    decisive_games = wins + losses
    winrate = (wins / decisive_games) if decisive_games > 0 else None

    return {
        "archetype_id": archetype_id,
        "archetype_name": archetype_name,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "exclude_mirror": exclude_mirror,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "matches": total,
        "winrate": winrate,
    }
