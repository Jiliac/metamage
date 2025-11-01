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
