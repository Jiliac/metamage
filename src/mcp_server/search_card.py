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
                SELECT id, name, scryfall_oracle_id
                FROM cards
                WHERE name LIKE :pattern
                ORDER BY CASE WHEN name = :exact THEN 0 ELSE 1 END, LENGTH(name)
                """
            ),
            {"pattern": pattern, "exact": q.lower()},
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

        return {
            "card_id": db_card_id,
            "name": scryfall.get("name"),
            "type": scryfall.get("type_line"),
            "oracle_text": scryfall.get("oracle_text"),
            "mana_cost": scryfall.get("mana_cost"),
        }

    # Fallback: if Scryfall failed but DB matched, return partial info
    if db_card_id:
        return {
            "card_id": db_card_id,
            "name": rows[0]._mapping["name"],
            "type": None,
            "oracle_text": None,
            "mana_cost": None,
        }

    raise ValueError("Card not found in local DB and Scryfall lookup failed")
