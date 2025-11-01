from datetime import datetime
from typing import Dict, Any
from sqlalchemy import text
from sqlalchemy.engine import Engine


def compute_matchup_winrate(
    engine: Engine,
    format_id: str,
    archetype1_name: str,
    archetype2_name: str,
    start: datetime,
    end: datetime,
) -> Dict[str, Any]:
    """
    Compute head-to-head matchup results and winrate (excluding draws) between two archetypes
    within a date range. Pure function shared by MCP server and ChatGPT app.

    Args:
        engine: SQLAlchemy Engine
        format_id: Format UUID
        archetype1_name: Name of first archetype (case-insensitive)
        archetype2_name: Name of second archetype (case-insensitive)
        start: Start datetime (inclusive)
        end: End datetime (inclusive)

    Returns:
        Dict with keys:
          - format_id, archetype1_name, archetype2_name
          - start_date, end_date
          - arch1_wins, arch1_losses, draws, total_matches, decisive_matches
          - winrate_no_draws (percentage, 2 decimals) or None if no decisive matches
    """
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
    decisive = arch1_wins + arch1_losses
    winrate_no_draws = round((arch1_wins / decisive) * 100, 2) if decisive > 0 else None

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
        "decisive_matches": decisive,
        "winrate_no_draws": winrate_no_draws,
    }
