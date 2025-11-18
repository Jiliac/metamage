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
        LEFT JOIN matches m ON te.id = m.entry_id
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


def compute_archetype_cards(
    engine: Engine,
    format_id: str,
    archetype_name: str,
    start,
    end,
    board: str = "MAIN",
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Compute top cards in a specific archetype within a date range.

    Returns dict:
      - format_id, archetype_name, start_date, end_date, board
      - cards: list of {card_name, total_copies, decks_playing, avg_copies_per_deck, presence_percent}
    """
    if board not in ["MAIN", "SIDE"]:
        raise ValueError("board must be 'MAIN' or 'SIDE'")

    sql = """
        WITH archetype_decks AS (
            SELECT COUNT(DISTINCT te.id) as total_archetype_decks
            FROM tournament_entries te
            JOIN tournaments t ON te.tournament_id = t.id
            JOIN archetypes a ON te.archetype_id = a.id
            WHERE t.format_id = :format_id
              AND t.date >= :start
              AND t.date <= :end
              AND LOWER(a.name) = LOWER(:archetype_name)
        ),
        card_stats AS (
            SELECT 
                c.name as card_name,
                SUM(dc.count) as total_copies,
                COUNT(DISTINCT te.id) as decks_playing,
                ROUND(AVG(CAST(dc.count AS REAL)), 2) as avg_copies_per_deck
            FROM deck_cards dc
            JOIN cards c ON dc.card_id = c.id
            JOIN tournament_entries te ON dc.entry_id = te.id
            JOIN tournaments t ON te.tournament_id = t.id
            JOIN archetypes a ON te.archetype_id = a.id
            WHERE t.format_id = :format_id
              AND t.date >= :start
              AND t.date <= :end
              AND LOWER(a.name) = LOWER(:archetype_name)
              AND dc.board = :board
            GROUP BY c.id, c.name
        )
        SELECT 
            card_name,
            total_copies,
            decks_playing,
            avg_copies_per_deck,
            ROUND(
                CAST(decks_playing AS REAL) / 
                CAST((SELECT total_archetype_decks FROM archetype_decks) AS REAL) * 100, 2
            ) as presence_percent
        FROM card_stats
        WHERE decks_playing > 0
        ORDER BY decks_playing DESC, total_copies DESC
        LIMIT :limit
    """

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {
                "format_id": format_id,
                "archetype_name": archetype_name,
                "start": start,
                "end": end,
                "board": board,
                "limit": limit,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "archetype_name": archetype_name,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "board": board,
        "cards": data,
    }


def compute_archetype_winrate(
    engine: Engine,
    archetype_id: str,
    start,
    end,
    exclude_mirror: bool = True,
) -> Dict[str, Any]:
    """
    Compute wins/losses/draws and winrate (excluding draws) for a given archetype_id within [start, end].
    """
    base_sql = """
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
    sql = base_sql + (" AND m.mirror = 0" if exclude_mirror else "")

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


def compute_archetype_trends(
    engine: Engine,
    format_id: str,
    archetype_name: str,
    days_back: int = 30,
) -> Dict[str, Any]:
    """
    Get weekly presence and winrate trends for an archetype over time.

    Args:
        engine: SQLAlchemy Engine
        format_id: Format UUID
        archetype_name: Archetype name (case-insensitive)
        days_back: Number of days to look back (default: 30)

    Returns:
        Dict with weekly trend data: week_start, week_end, entries, total_matches, wins, losses, draws,
        presence_percent, winrate_no_draws
    """
    # Build SQL with days_back substituted into SQLite date function
    sql = """
        WITH weeks AS (
            SELECT 
                date(t.date, 'weekday 0', '-6 days') as week_start,
                date(t.date, 'weekday 0') as week_end,
                COUNT(DISTINCT te.id) as entries,
                COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) as wins,
                COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END) as losses,
                COUNT(CASE WHEN m.result = 'DRAW' THEN 1 END) as draws,
                COUNT(*) as total_matches
            FROM tournaments t
            JOIN tournament_entries te ON t.id = te.tournament_id
            JOIN archetypes a ON te.archetype_id = a.id
            LEFT JOIN matches m ON te.id = m.entry_id AND m.entry_id < m.opponent_entry_id
            WHERE t.format_id = :format_id
            AND LOWER(a.name) = LOWER(:archetype_name)
            AND t.date >= date('now', '-{} days')
            GROUP BY week_start, week_end
        ),
        total_per_week AS (
            SELECT 
                date(t.date, 'weekday 0', '-6 days') as week_start,
                COUNT(DISTINCT te.id) as total_format_entries
            FROM tournaments t
            JOIN tournament_entries te ON t.id = te.tournament_id
            WHERE t.format_id = :format_id
            AND t.date >= date('now', '-{} days')
            GROUP BY week_start
        )
        SELECT 
            w.week_start,
            w.week_end,
            w.entries,
            w.total_matches,
            w.wins,
            w.losses,
            w.draws,
            ROUND(
                CAST(w.entries AS REAL) / 
                CAST(tpw.total_format_entries AS REAL) * 100, 2
            ) as presence_percent,
            ROUND(
                CAST(w.wins AS REAL) / 
                CAST((w.wins + w.losses) AS REAL) * 100, 2
            ) as winrate_no_draws
        FROM weeks w
        LEFT JOIN total_per_week tpw ON w.week_start = tpw.week_start
        ORDER BY w.week_start
    """.format(days_back, days_back)

    with engine.connect() as conn:
        rows = conn.execute(
            text(sql),
            {
                "format_id": format_id,
                "archetype_name": archetype_name,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "archetype_name": archetype_name,
        "days_back": days_back,
        "weekly_trends": data,
    }
