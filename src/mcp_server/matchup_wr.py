from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text

from .utils import engine
from .mcp import mcp


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
