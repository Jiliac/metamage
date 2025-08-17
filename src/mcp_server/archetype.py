from sqlalchemy import text

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls


def _find_archetype_fuzzy(archetype_name: str):
    """Find archetype using fuzzy matching with fallback strategies."""

    # Strategy 1: Exact match (case-insensitive)
    exact_sql = """
        SELECT a.id, a.name, f.name as format_name
        FROM archetypes a
        JOIN formats f ON a.format_id = f.id
        WHERE LOWER(a.name) = LOWER(:archetype_name)
    """

    with engine.connect() as conn:
        result = conn.execute(
            text(exact_sql), {"archetype_name": archetype_name}
        ).first()
        if result:
            return result._mapping

    # Strategy 2: Partial match (contains)
    partial_sql = """
        SELECT a.id, a.name, f.name as format_name
        FROM archetypes a
        JOIN formats f ON a.format_id = f.id
        WHERE LOWER(a.name) LIKE LOWER(:pattern)
        ORDER BY LENGTH(a.name)
        LIMIT 1
    """

    with engine.connect() as conn:
        pattern = f"%{archetype_name}%"
        result = conn.execute(text(partial_sql), {"pattern": pattern}).first()
        if result:
            return result._mapping

    # Strategy 3: Word-based matching (split and match individual words)
    words = archetype_name.lower().split()
    if len(words) > 1:
        word_conditions = []
        params = {}
        for i, word in enumerate(words):
            word_conditions.append(f"LOWER(a.name) LIKE :word_{i}")
            params[f"word_{i}"] = f"%{word}%"

        word_sql = f"""
            SELECT a.id, a.name, f.name as format_name
            FROM archetypes a
            JOIN formats f ON a.format_id = f.id
            WHERE {" AND ".join(word_conditions)}
            ORDER BY LENGTH(a.name)
            LIMIT 1
        """

        with engine.connect() as conn:
            result = conn.execute(text(word_sql), params).first()
            if result:
                return result._mapping

    return None


@log_tool_calls
@mcp.tool
def get_archetype_overview(archetype_name: str, ctx: Context = None) -> str:
    """
    Get archetype overview with recent performance and key cards.
    Uses fuzzy matching to find archetypes by partial name.

    Workflow Integration:
    - Use this first to resolve an archetype by name (fuzzy matching).
    - Then:
      - get_archetype_cards() for detailed card adoption within a date range/board.
      - get_archetype_winrate() to compute W/L/D and winrate for a specific window.
      - get_archetype_trends() to see weekly presence and winrate trends.
      - get_matchup_winrate() for head-to-head vs another archetype.
      - query_database() for custom splits (e.g., with/without a card, by event size).

    Related Tools:
    - search_card() → get card_id to combine with archetype_id in custom analyses.
    - get_sources() → fetch recent tournaments and links for supporting evidence.
    - get_meta_report() → see how this archetype sits in the broader metagame.

    Example Workflow:
    1) arch = get_archetype_overview("Yawgmoth")
    2) cards = get_archetype_cards(format_id, "Yawgmoth", start, end, board="MAIN")
    3) wr = get_archetype_winrate(arch.archetype_id, start, end, exclude_mirror=True)
    4) trend = get_archetype_trends(format_id, "Yawgmoth", days_back=60)
    5) For nuanced splits, use query_database() with IDs from steps 1–2.
    """
    # Find archetype using fuzzy matching
    arch_match = _find_archetype_fuzzy(archetype_name)

    if not arch_match:
        return f"Archetype '{archetype_name}' not found. Try a different name or check spelling."

    # Use the found archetype name for the main query
    found_name = arch_match["name"]

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
            conn.execute(text(sql), {"archetype_name": found_name}).mappings().first()
        )

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
        cards = conn.execute(text(cards_sql), {"archetype_name": found_name}).fetchall()

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
