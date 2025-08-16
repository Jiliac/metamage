from sqlalchemy import text

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls


@log_tool_calls
@mcp.tool
def get_archetype_overview(archetype_name: str, ctx: Context = None) -> str:
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
