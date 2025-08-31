from typing import Dict, Any, Optional

import requests
from sqlalchemy import text

from .utils import engine
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls


@log_tool_calls
@mcp.tool
def search_card(query: str, ctx: Context = None) -> Dict[str, Any]:
    """
    Search a card by partial name in the local DB; if not found, fall back to Scryfall fuzzy search.
    Even if the DB yields results, Scryfall is queried to return full card details.

    Returns:
        {
            "card_id": <local DB card UUID or None>,
            "name": <card name>,
            "type": <type line>,
            "oracle_text": <oracle text>,
            "mana_cost": <mana cost string>
        }

    Workflow Integration:
    - Use the returned card_id with:
      - get_card_presence() to see format-wide adoption.
      - get_archetype_cards() to analyze usage within a specific archetype.
      - query_database() for custom adoption, copies-per-deck, or performance splits.
    - If card_id is None but Scryfall finds the card, you can still use the name to locate it in the DB
      via query_database() by joining on scryfall_oracle_id.

    Related Tools:
    - get_archetype_overview() → find archetype_id by name (fuzzy)
    - get_archetype_cards(), get_card_presence() → adoption summaries
    - query_database() → advanced/verification queries

    Example Workflow: Card adoption within an archetype over a date window
    1) card = search_card("Psychic Frog") → card_id
    2) arch = get_archetype_overview("Domain Zoo") → pick the matched archetype_id
    3) Use query_database() with a SELECT that counts entries with/without card_id for that archetype_id,
       and computes W/L/D splits to compare winrates.
    """
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")

    q = " ".join(query.strip().split())
    pattern = f"%{q.lower()}%"

    db_card_id: Optional[str] = None

    # Simple local DB search by (case-insensitive) name
    with engine.connect() as conn:
        rows = conn.execute(
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

    if rows:
        first = rows[0]._mapping
        db_card_id = first["id"]
        q = first["name"]

    # Always fetch Scryfall for canonical details (fuzzy)
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
        if rows:
            first = rows[0]._mapping
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
    if db_card_id:
        first = rows[0]._mapping
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
