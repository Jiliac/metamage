#!/usr/bin/env python3
"""
Backfill is_land flag on cards using Scryfall's collection API.

This script will:
1) Ensure the 'is_land' column exists on the 'cards' table (adds it with default 0 if missing).
2) Query Scryfall in batches by oracle_id to determine if a card is a Land.
3) Update cards setting is_land = 1 where applicable.

Safe to re-run; it only updates rows where is_land is currently 0.
"""

import sys
import time
import json
from pathlib import Path
from typing import Iterable, List, Dict

import requests
from sqlalchemy import text

# Ensure we can import from src/
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from models import get_engine, get_session_factory
from models.reference import Card

SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection"
BATCH_SIZE = 75  # Scryfall max per collection request
SLEEP_SEC = 0.1  # be polite


def chunked(iterable: Iterable, n: int):
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


def ensure_is_land_column_exists():
    """
    For SQLite: add is_land column if it doesn't exist, with NOT NULL DEFAULT 0.
    """
    engine = get_engine()
    with engine.connect() as conn:
        cols = conn.execute(text("PRAGMA table_info(cards)")).fetchall()
        col_names = {row[1] for row in cols}  # row[1] = name
        if "is_land" not in col_names:
            conn.execute(
                text("ALTER TABLE cards ADD COLUMN is_land BOOLEAN NOT NULL DEFAULT 0")
            )


def fetch_is_land_for_oracle_ids(oracle_ids: List[str]) -> Dict[str, bool]:
    """
    Returns mapping oracle_id -> is_land using Scryfall collection API.
    """
    payload = {
        "identifiers": [{"oracle_id": oid} for oid in oracle_ids if oid],
    }
    resp = requests.post(
        SCRYFALL_COLLECTION_URL,
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()

    result: Dict[str, bool] = {}
    for c in data.get("data", []):
        oid = c.get("oracle_id")
        type_line = c.get("type_line") or ""
        is_land = "Land" in type_line
        if oid:
            result[oid] = is_land

    return result


def main():
    ensure_is_land_column_exists()

    Session = get_session_factory()
    session = Session()
    try:
        total = session.query(Card).count()
        todo = session.query(Card).filter(Card.is_land == False).count()  # noqa: E712
        print(
            f"Found {total} cards. {todo} without is_land set. Backfilling using Scryfall..."
        )

        # Fetch only those that are not yet marked as land
        all_cards = (
            session.query(Card.id, Card.scryfall_oracle_id)
            .filter(Card.is_land == False)  # noqa: E712
            .all()
        )

        processed = 0
        updated_true = 0

        for chunk in chunked([dict(id=c[0], oid=c[1]) for c in all_cards], BATCH_SIZE):
            oids = [c["oid"] for c in chunk if c["oid"]]
            if not oids:
                processed += len(chunk)
                continue

            try:
                mapping = fetch_is_land_for_oracle_ids(oids)
            except Exception as e:
                print(f"Error fetching batch: {e}. Sleeping and continuing...")
                time.sleep(1.0)
                continue

            # Update only True; False remains 0 (default)
            ids_to_set_true = [c["id"] for c in chunk if mapping.get(c["oid"], False)]
            if ids_to_set_true:
                session.query(Card).filter(Card.id.in_(ids_to_set_true)).update(
                    {"is_land": True}, synchronize_session=False
                )
                updated_true += len(ids_to_set_true)

            session.commit()
            processed += len(chunk)
            print(f"Processed {processed}/{todo}... (+{updated_true} lands)")

            time.sleep(SLEEP_SEC)

        print(f"Done. Marked {updated_true} cards as lands.")

    finally:
        session.close()


if __name__ == "__main__":
    main()
