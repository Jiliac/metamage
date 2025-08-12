from datetime import datetime, timedelta
from sqlalchemy import func, distinct

from .utils import get_session
from .mcp import mcp
from ..models import Player, TournamentEntry, Tournament, Archetype


@mcp.tool
def get_player(player_id: str) -> str:
    """
    Get player profile with recent tournament entries and performance.
    """
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
            .filter(Player.id == player_id, Tournament.date >= cutoff)
            .group_by(Player.id, Player.handle)
            .first()
        )

    if not player_info:
        return f"Player {player_id} not found"

    # Normalize mapping access for formatted output
    player_info = dict(player_info._mapping)

    # Get recent results
    with get_session() as session:
        results = (
            session.query(
                Tournament.name.label("tournament_name"),
                Tournament.date.label("date"),
                Archetype.name.label("archetype_name"),
                TournamentEntry.wins,
                TournamentEntry.losses,
                TournamentEntry.draws,
                TournamentEntry.rank,
            )
            .join(Tournament, TournamentEntry.tournament_id == Tournament.id)
            .join(Archetype, TournamentEntry.archetype_id == Archetype.id)
            .filter(TournamentEntry.player_id == player_id, Tournament.date >= cutoff)
            .order_by(Tournament.date.desc())
            .limit(5)
            .all()
        )

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
