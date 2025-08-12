from sqlalchemy import text

from .utils import engine
from .mcp import mcp


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
