from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.engine import Engine
import requests


def search_card(engine: Engine, query: str) -> Dict[str, Any]:
    """
    Shared card search logic.

    - Search local DB by name (case-insensitive, partials allowed).
    - Always fetch canonical details from Scryfall fuzzy endpoint.
    - If Scryfall returns, try to map to local DB by oracle_id if needed.
    - Return a unified payload compatible with mcp_server.search_card.

    Returns dict with keys:
      card_id, name, type, oracle_text, mana_cost, colors, is_land, first_printed_set
    """
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")

    q = " ".join(query.strip().split())
    pattern = f"%{q.lower()}%"

    db_card_rows = []
    db_card_id: Optional[str] = None

    # Local DB search
    with engine.connect() as conn:
        db_card_rows = conn.execute(
            text(
                """
                SELECT c.id, c.name, c.scryfall_oracle_id, c.colors, c.is_land,
                       s.code as set_code, s.name as set_name, c.first_printed_date
                FROM cards c
                LEFT JOIN sets s ON c.first_printed_set_id = s.id
                WHERE LOWER(c.name) LIKE :pattern
                ORDER BY CASE WHEN LOWER(c.name) = :exact_lower THEN 0 ELSE 1 END, LENGTH(c.name)
                """
            ),
            {"pattern": pattern, "exact_lower": q.lower()},
        ).fetchall()

    if db_card_rows:
        first = db_card_rows[0]._mapping
        db_card_id = first["id"]
        q = first["name"]

    # Scryfall fuzzy lookup
    scryfall = None
    try:
        resp = requests.get(
            "https://api.scryfall.com/cards/named",
            params={"fuzzy": q},
            timeout=10,
        )
        if resp.status_code == 200:
            scryfall = resp.json()
    except Exception:
        scryfall = None

    if scryfall:
        # If we didn't have a DB id yet, try to map by oracle_id
        oracle_id = scryfall.get("oracle_id")
        if oracle_id and not db_card_id:
            with engine.connect() as conn:
                row = conn.execute(
                    text("SELECT id FROM cards WHERE scryfall_oracle_id = :oid"),
                    {"oid": oracle_id},
                ).first()
                if row:
                    db_card_id = row[0]

        # Include local DB info if available
        db_colors = None
        db_is_land = None
        db_set_info = None
        if db_card_rows:
            first = db_card_rows[0]._mapping
            db_colors = first.get("colors")
            db_is_land = first.get("is_land")
            if first.get("set_code"):
                db_set_info = {
                    "code": first.get("set_code"),
                    "name": first.get("set_name"),
                    "first_printed": str(first.get("first_printed_date"))
                    if first.get("first_printed_date")
                    else None,
                }

        return {
            "card_id": db_card_id,
            "name": scryfall.get("name"),
            "type": scryfall.get("type_line"),
            "oracle_text": scryfall.get("oracle_text"),
            "mana_cost": scryfall.get("mana_cost"),
            "colors": db_colors or "".join(sorted(scryfall.get("colors", []))),
            "is_land": db_is_land
            if db_is_land is not None
            else ("Land" in scryfall.get("type_line", "")),
            "first_printed_set": db_set_info,
        }

    # Fallback: if Scryfall failed but DB matched, return partial info
    if db_card_id and db_card_rows:
        first = db_card_rows[0]._mapping
        db_set_info = None
        if first.get("set_code"):
            db_set_info = {
                "code": first.get("set_code"),
                "name": first.get("set_name"),
                "first_printed": str(first.get("first_printed_date"))
                if first.get("first_printed_date")
                else None,
            }

        return {
            "card_id": db_card_id,
            "name": first["name"],
            "type": None,
            "oracle_text": None,
            "mana_cost": None,
            "colors": first.get("colors"),
            "is_land": first.get("is_land"),
            "first_printed_set": db_set_info,
        }

    raise ValueError("Card not found in local DB and Scryfall lookup failed")


def compute_card_presence(
    engine: Engine,
    format_id: str,
    start,
    end,
    board: Optional[str] = None,
    exclude_lands: bool = True,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Compute top cards by presence within a format and date range.

    Args:
        engine: SQLAlchemy Engine
        format_id: Format UUID
        start: Start datetime (inclusive)
        end: End datetime (inclusive)
        board: 'MAIN', 'SIDE', or None for both
        exclude_lands: Whether to exclude lands (default True)
        limit: Max cards to return (default 20)

    Returns:
        Dict with keys: format_id, start_date, end_date, board, cards (list of dicts)
    """
    if board is not None and board not in ["MAIN", "SIDE"]:
        raise ValueError("board must be 'MAIN', 'SIDE', or None")

    sql = """
        WITH total_decks AS (
            SELECT COUNT(DISTINCT te.id) as total_format_decks
            FROM tournament_entries te
            JOIN tournaments t ON te.tournament_id = t.id
            WHERE t.format_id = :format_id
              AND t.date >= :start
              AND t.date <= :end
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
            WHERE t.format_id = :format_id
              AND t.date >= :start
              AND t.date <= :end
              AND (:board IS NULL OR dc.board = :board)
              AND (NOT :exclude_lands OR NOT c.is_land)
            GROUP BY c.id, c.name
        )
        SELECT 
            card_name,
            total_copies,
            decks_playing,
            avg_copies_per_deck,
            ROUND(
                CAST(decks_playing AS REAL) / 
                CAST((SELECT total_format_decks FROM total_decks) AS REAL) * 100, 2
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
                "start": start,
                "end": end,
                "board": board,
                "exclude_lands": exclude_lands,
                "limit": limit,
            },
        ).fetchall()

    data = [dict(r._mapping) for r in rows]

    return {
        "format_id": format_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "board": board,
        "cards": data,
    }
