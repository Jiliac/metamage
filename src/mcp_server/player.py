from sqlalchemy import text

from .utils import engine
from .mcp import mcp


@mcp.tool
def get_players_overview() -> str:
    """
    Get overview of top performing players with recent tournament activity.
    """
    sql = """
        SELECT 
            p.handle,
            p.id as player_id,
            COUNT(DISTINCT te.id) as total_entries,
            COUNT(DISTINCT t.id) as tournaments_played,
            ROUND(
                CAST(SUM(te.wins) AS REAL) / CAST((SUM(te.wins) + SUM(te.losses)) AS REAL) * 100, 1
            ) as winrate,
            MAX(t.date) as last_tournament
        FROM players p
        JOIN tournament_entries te ON p.id = te.player_id
        JOIN tournaments t ON te.tournament_id = t.id
        WHERE t.date >= date('now', '-30 days')
        GROUP BY p.id, p.handle
        HAVING total_entries >= 3
        ORDER BY winrate DESC, total_entries DESC
        LIMIT 20
    """

    with engine.connect() as conn:
        players = conn.execute(text(sql)).fetchall()

    if not players:
        return "No player data available for the last 30 days"

    player_list = "\n".join(
        [
            f"- **{player.handle}** (ID: {player.player_id}): {player.total_entries} entries, {player.winrate or 'N/A'}% WR"
            for player in players
        ]
    )

    return f"""# MTG Top Players (Last 30 Days)

## Most Active & Successful Players

{player_list}

*Minimum 3 tournament entries required*
*Use query_database() tool for detailed player analysis*
"""
