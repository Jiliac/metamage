from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.engine import Engine


def _find_archetype_fuzzy(
    engine: Engine, archetype_name: str
) -> Optional[Dict[str, Any]]:
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
            return dict(result._mapping)

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
            return dict(result._mapping)

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
                return dict(result._mapping)

    return None


def compute_archetype_overview(engine: Engine, archetype_name: str) -> Dict[str, Any]:
    """
    Shared logic to compute archetype overview with recent performance and key cards.
    Mirrors the previous MCP implementation but is reusable by other apps.
    """
    # Find archetype using fuzzy matching
    arch_match = _find_archetype_fuzzy(engine, archetype_name)
    if not arch_match:
        return {
            "error": f"Archetype '{archetype_name}' not found. Try a different name or check spelling."
        }

    # Use the found archetype name for the main query
    found_name = arch_match["name"]

    # Get archetype info with recent performance
    sql = """
        SELECT 
            a.id as archetype_id,
            a.name as archetype_name,
            f.name as format_name,
            f.id as format_id,
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
        GROUP BY a.id, a.name, f.name, f.id
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

    return {
        "archetype_id": arch_info["archetype_id"],
        "archetype_name": arch_info["archetype_name"],
        "format_id": arch_info["format_id"],
        "format_name": arch_info["format_name"],
        "recent_performance": {
            "tournament_entries": arch_info["recent_entries"] or 0,
            "tournaments_played": arch_info["tournaments_played"] or 0,
            "winrate_percent": arch_info["winrate_no_draws"],
        },
        "key_cards": [
            {
                "name": c.card_name,
                "avg_copies": c.avg_copies,
                "decks_playing": c.decks_playing,
            }
            for c in cards
        ],
    }
