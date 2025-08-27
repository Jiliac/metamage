#!/usr/bin/env python3
"""
Backfill card sets, colors, and earliest printing information using Scryfall API.

This script will:
1. Add new columns to existing tables if they don't exist
2. For each card with an oracle_id, query Scryfall for all printings
3. Find the earliest printing and extract color information
4. Populate Set table, CardColor table, and new Card fields

Safe to re-run; only updates cards where data is missing.
"""

import sys
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime

import requests
from sqlalchemy import text

# Ensure we can import from src/
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from models import get_engine, get_session_factory
from models.reference import Card, Set, CardColor

SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search"
BATCH_SIZE = 50  # Process cards in batches
SLEEP_SEC = 0.1  # Rate limiting


def chunked(iterable, n: int):
    """Split iterable into chunks of size n."""
    it = iter(iterable)
    while True:
        chunk = []
        try:
            for _ in range(n):
                chunk.append(next(it))
        except StopIteration:
            if chunk:
                yield chunk
            break
        if chunk:
            yield chunk


def ensure_new_columns_exist():
    """
    Add new columns to existing tables if they don't exist.
    """
    engine = get_engine()
    with engine.connect() as conn:
        # Check if sets table exists
        sets_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='sets'")
        ).fetchone()

        if not sets_exists:
            print("  ⚠️ Sets table doesn't exist. Run database migration first.")
            return False

        # Check Card table columns
        card_cols = conn.execute(text("PRAGMA table_info(cards)")).fetchall()
        col_names = {row[1] for row in card_cols}

        missing_cols = []
        if "colors" not in col_names:
            missing_cols.append("colors")
        if "first_printed_set_id" not in col_names:
            missing_cols.append("first_printed_set_id")
        if "first_printed_date" not in col_names:
            missing_cols.append("first_printed_date")

        if missing_cols:
            print(f"  ⚠️ Missing columns in cards table: {missing_cols}")
            print("  Run database migration first.")
            return False

        # Check if card_colors table exists
        card_colors_exists = conn.execute(
            text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='card_colors'"
            )
        ).fetchone()

        if not card_colors_exists:
            print("  ⚠️ card_colors table doesn't exist. Run database migration first.")
            return False

    return True


def fetch_all_printings_for_oracle_id(oracle_id: str) -> Optional[List[Dict[str, Any]]]:
    """
    Fetch all printings for a card by oracle_id from Scryfall.
    Returns list sorted by release date (earliest first).
    """
    params = {
        "q": f"oracle_id:{oracle_id}",
        "unique": "prints",
        "order": "released",
        "dir": "asc",
    }

    try:
        time.sleep(SLEEP_SEC)
        response = requests.get(SCRYFALL_SEARCH_URL, params=params, timeout=15)

        if response.status_code == 200:
            data = response.json()
            return data.get("data", [])
        elif response.status_code == 404:
            return None
        else:
            print(
                f"  ⚠️ Scryfall API error for oracle_id {oracle_id}: HTTP {response.status_code}"
            )
            return None

    except requests.RequestException as e:
        print(f"  ⚠️ Network error fetching oracle_id {oracle_id}: {e}")
        return None


def parse_scryfall_card_data(card_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract relevant data from a Scryfall card response.
    """
    return {
        "name": card_data.get("name", ""),
        "set_code": card_data.get("set", "").upper(),
        "set_name": card_data.get("set_name", ""),
        "set_type": card_data.get("set_type", ""),
        "released_at": card_data.get("released_at", ""),
        "colors": card_data.get("colors", []),
        "oracle_id": card_data.get("oracle_id", ""),
    }


def get_or_create_set(
    session, set_code: str, set_name: str, set_type: str, released_at: str
) -> Set:
    """
    Get existing set or create new one.
    """
    set_obj = session.query(Set).filter(Set.code == set_code).first()
    if set_obj:
        return set_obj

    try:
        released_date = datetime.strptime(released_at, "%Y-%m-%d")
    except ValueError:
        print(f"  ⚠️ Invalid date format for set {set_code}: {released_at}")
        released_date = datetime.now()

    set_obj = Set(
        code=set_code, name=set_name, set_type=set_type, released_at=released_date
    )
    session.add(set_obj)
    session.flush()  # Get the ID
    return set_obj


def update_card_with_printing_data(
    session, card: Card, printings: List[Dict[str, Any]]
):
    """
    Update card with colors and earliest printing information.
    """
    if not printings:
        return False

    # Parse all printings
    parsed_printings = [parse_scryfall_card_data(p) for p in printings]

    # Find earliest printing (first in chronologically sorted list)
    earliest = parsed_printings[0]

    try:
        earliest_date = datetime.strptime(earliest["released_at"], "%Y-%m-%d")
    except ValueError:
        print(
            f"  ⚠️ Invalid date format for earliest printing: {earliest['released_at']}"
        )
        earliest_date = datetime.now()

    # Get or create the earliest set
    earliest_set = get_or_create_set(
        session,
        earliest["set_code"],
        earliest["set_name"],
        earliest["set_type"],
        earliest["released_at"],
    )

    # Update card with colors and set info
    colors_list = earliest.get("colors", [])
    colors_str = "".join(sorted(colors_list)) if colors_list else ""

    card.colors = colors_str
    card.first_printed_set_id = earliest_set.id
    card.first_printed_date = earliest_date

    # Clear existing colors and add new ones
    session.query(CardColor).filter(CardColor.card_id == card.id).delete()

    for color in colors_list:
        card_color = CardColor(card_id=card.id, color=color)
        session.add(card_color)

    return True


def main():
    if not ensure_new_columns_exist():
        print("❌ Schema not ready. Please run database migrations first.")
        return

    Session = get_session_factory()
    session = Session()

    try:
        # Get all cards that need processing
        cards_to_process = (
            session.query(Card)
            .filter(
                Card.scryfall_oracle_id.isnot(None),
                Card.colors.is_(None),  # Only process cards without colors set
            )
            .all()
        )

        total_cards = len(cards_to_process)
        print(f"🃏 Found {total_cards} cards to process for colors and set information")

        if total_cards == 0:
            print("✅ All cards already have color and set information")
            return

        stats = {
            "processed": 0,
            "updated": 0,
            "skipped_no_data": 0,
            "skipped_error": 0,
            "sets_created": 0,
        }

        for i, card in enumerate(cards_to_process):
            print(f"  📊 Processing {i + 1}/{total_cards}: {card.name}")

            try:
                printings = fetch_all_printings_for_oracle_id(card.scryfall_oracle_id)

                if not printings:
                    print(f"    ⚠️ No printings found for {card.name}")
                    stats["skipped_no_data"] += 1
                    continue

                success = update_card_with_printing_data(session, card, printings)

                if success:
                    session.commit()
                    stats["updated"] += 1
                    print(
                        f"    ✅ Updated {card.name} - Colors: {card.colors or 'colorless'}"
                    )
                else:
                    stats["skipped_error"] += 1

            except Exception as e:
                print(f"    ❌ Error processing {card.name}: {e}")
                session.rollback()
                stats["skipped_error"] += 1

            stats["processed"] += 1

            # Progress update every 25 cards
            if (i + 1) % 25 == 0:
                print(f"  📊 Progress: {i + 1}/{total_cards} cards processed...")

        # Print summary
        print("\n📊 Migration Summary:")
        print(f"  📈 Total cards processed: {stats['processed']}")
        print(f"  ✅ Cards updated: {stats['updated']}")
        print(f"  ⚠️ Skipped (no data): {stats['skipped_no_data']}")
        print(f"  ❌ Skipped (errors): {stats['skipped_error']}")

        # Count sets created
        sets_count = session.query(Set).count()
        print(f"  🗂️ Total sets in database: {sets_count}")

    finally:
        session.close()


if __name__ == "__main__":
    main()
