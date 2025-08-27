"""
Card ingestion module.

Handles the ingestion of card data from tournament JSON files.
Integrates with Scryfall API to fetch canonical card names and oracle IDs.
"""

import time
import requests
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.reference import Card
from models.reference import Set as SetModel, CardColor


class CardCache:
    """In-memory cache for cards to avoid duplicate database lookups and API calls."""

    def __init__(self):
        self.cache: Dict[str, Card] = {}  # normalized_name -> Card
        self.processed: set[str] = set()  # Track what we've seen this session
        self.scryfall_cache: Dict[str, Dict[str, Any]] = {}  # Cache API responses

    def get(self, normalized_name: str) -> Optional[Card]:
        """Get card from cache."""
        return self.cache.get(normalized_name)

    def add(self, normalized_name: str, card: Card):
        """Add card to cache."""
        self.cache[normalized_name] = card

    def is_processed(self, normalized_name: str) -> bool:
        """Check if we've already processed this card in this session."""
        return normalized_name in self.processed

    def mark_processed(self, normalized_name: str):
        """Mark card as processed in this session."""
        self.processed.add(normalized_name)

    def get_scryfall_data(self, name: str) -> Optional[Dict[str, Any]]:
        """Get cached Scryfall API response."""
        return self.scryfall_cache.get(name.lower())

    def cache_scryfall_data(self, name: str, data: Dict[str, Any]):
        """Cache Scryfall API response."""
        self.scryfall_cache[name.lower()] = data


def normalize_card_name(name: str) -> str:
    """
    Normalize card name for duplicate detection.

    Performs minimal normalization:
    - Lowercase conversion
    - Whitespace trimming and normalization
    - Preserves special characters and punctuation

    Examples:
        "Lightning Bolt" -> "lightning bolt"
        "Jace, the Mind Sculptor" -> "jace, the mind sculptor"
        "Lórien Revealed" -> "lórien revealed"
    """
    return " ".join(name.strip().lower().split())


def fetch_scryfall_data(card_name: str, cache: CardCache) -> Optional[Dict[str, Any]]:
    """
    Fetch card data from Scryfall API with caching and rate limiting.

    Args:
        card_name: Name of the card to look up
        cache: Card cache instance for storing responses

    Returns:
        Dictionary with card data or None if not found/error
    """
    # Check cache first
    cached_data = cache.get_scryfall_data(card_name)
    if cached_data:
        return cached_data

    # Prepare API request
    url = "https://api.scryfall.com/cards/named"
    params = {"fuzzy": card_name}

    try:
        # Rate limiting - Scryfall recommends 50-100ms between requests
        time.sleep(0.05)

        response = requests.get(url, params=params, timeout=10)

        if response.status_code == 200:
            data = response.json()
            # Cache the successful response
            cache.cache_scryfall_data(card_name, data)
            return data
        elif response.status_code == 404:
            # Card not found - cache the negative result
            cache.cache_scryfall_data(card_name, None)
            return None
        else:
            print(
                f"  ⚠️ Scryfall API error for '{card_name}': HTTP {response.status_code}"
            )
            return None

    except requests.RequestException as e:
        print(f"  ⚠️ Network error fetching '{card_name}': {e}")
        return None


def fetch_all_printings_for_oracle_id(
    oracle_id: str, cache: CardCache
) -> Optional[List[Dict[str, Any]]]:
    """
    Fetch all printings for a card by oracle_id from Scryfall.
    Returns list sorted by release date (earliest first).
    """
    cache_key = f"printings_{oracle_id}"
    cached_printings = cache.get_scryfall_data(cache_key)
    if cached_printings is not None:
        return cached_printings

    url = "https://api.scryfall.com/cards/search"
    params = {
        "q": f"oracle_id:{oracle_id}",
        "unique": "prints",
        "order": "released",
        "dir": "asc",
    }

    try:
        time.sleep(0.05)  # Rate limiting
        response = requests.get(url, params=params, timeout=10)

        if response.status_code == 200:
            data = response.json()
            printings = data.get("data", [])
            cache.cache_scryfall_data(cache_key, printings)
            return printings
        elif response.status_code == 404:
            cache.cache_scryfall_data(cache_key, None)
            return None
        else:
            print(
                f"  ⚠️ Scryfall printings API error for oracle_id {oracle_id}: HTTP {response.status_code}"
            )
            return None

    except requests.RequestException as e:
        print(f"  ⚠️ Network error fetching printings for oracle_id {oracle_id}: {e}")
        return None


def get_or_create_set(
    session: Session, set_code: str, set_name: str, set_type: str, released_at: str
) -> SetModel:
    """
    Get existing set or create new one.
    """
    set_obj = session.query(SetModel).filter(SetModel.code == set_code.upper()).first()
    if set_obj:
        return set_obj

    try:
        released_date = datetime.strptime(released_at, "%Y-%m-%d")
    except ValueError:
        print(f"  ⚠️ Invalid date format for set {set_code}: {released_at}")
        released_date = datetime.now()

    set_obj = SetModel(
        code=set_code.upper(),
        name=set_name,
        set_type=set_type,
        released_at=released_date,
    )
    session.add(set_obj)
    session.flush()  # Get the ID
    return set_obj


def extract_unique_card_names(entries: List[Dict[str, Any]]) -> set[str]:
    """
    Extract unique card names from tournament entries.

    Looks for cards in both Mainboard and Sideboard sections.

    Args:
        entries: List of tournament entry dictionaries

    Returns:
        Set of unique card names found in the data
    """
    card_names = set()

    for entry in entries:
        # Process mainboard cards
        mainboard = entry.get("Mainboard", [])
        if isinstance(mainboard, list):
            for card_entry in mainboard:
                if isinstance(card_entry, dict) and "CardName" in card_entry:
                    card_name = card_entry["CardName"].strip()
                    if card_name:
                        card_names.add(card_name)

        # Process sideboard cards
        sideboard = entry.get("Sideboard", [])
        if isinstance(sideboard, list):
            for card_entry in sideboard:
                if isinstance(card_entry, dict) and "CardName" in card_entry:
                    card_name = card_entry["CardName"].strip()
                    if card_name:
                        card_names.add(card_name)

    return card_names


def get_or_create_card(
    session: Session, cache: CardCache, name: str
) -> tuple[Card, bool]:
    """
    Get existing card or create a new one.
    Uses cache and Scryfall API for performance and data enrichment.

    Returns:
        tuple: (Card, is_new) where is_new=True if card was just created
    """
    normalized_name = normalize_card_name(name)

    # 1) Check cache first
    card = cache.get(normalized_name)
    if card:
        return card, False

    # 2) Check database by stored (canonical) name
    card = session.query(Card).filter(Card.name == normalized_name).first()
    if card:
        cache.add(normalized_name, card)
        return card, False

    # 3) Resolve via Scryfall (cached per-run), then dedupe by oracle_id
    scryfall_data = fetch_scryfall_data(name, cache)
    if not scryfall_data:
        print(f"  ⚠️ Scryfall lookup failed for '{name}'; skipping without DB insert")
        raise ValueError(f"Scryfall lookup failed for '{name}'")

    canonical_name = scryfall_data.get("name", name)
    oracle_id = scryfall_data.get("oracle_id")
    type_line = scryfall_data.get("type_line", "")
    is_land = "Land" in type_line

    if not oracle_id:
        print(
            f"  ⚠️ Missing oracle_id for '{name}' (canonical '{canonical_name}'); skipping without DB insert"
        )
        raise ValueError(f"Missing oracle_id for '{name}'")

    # Try to reuse existing card by oracle_id
    existing = session.query(Card).filter(Card.scryfall_oracle_id == oracle_id).first()
    if existing:
        cache.add(normalized_name, existing)  # map querying name to existing Card
        return existing, False

    # 4) Extract colors and set information
    colors = scryfall_data.get("colors", [])
    colors_str = "".join(sorted(colors)) if colors else ""

    # 5) Try to get earliest printing info
    earliest_set = None
    first_printed_date = None

    if oracle_id:
        printings = fetch_all_printings_for_oracle_id(oracle_id, cache)
        if printings:
            earliest_printing = printings[0]  # Already sorted by release date
            set_code = earliest_printing.get("set", "").upper()
            set_name = earliest_printing.get("set_name", "")
            set_type = earliest_printing.get("set_type", "")
            released_at = earliest_printing.get("released_at", "")

            if set_code and released_at:
                try:
                    earliest_set = get_or_create_set(
                        session, set_code, set_name, set_type, released_at
                    )
                    first_printed_date = datetime.strptime(released_at, "%Y-%m-%d")
                except Exception as e:
                    print(f"  ⚠️ Error processing set data for '{canonical_name}': {e}")

    # 6) Create new card with all enriched data
    card = Card(
        name=canonical_name,
        scryfall_oracle_id=oracle_id,
        is_land=is_land,
        colors=colors_str,
        first_printed_set_id=earliest_set.id if earliest_set else None,
        first_printed_date=first_printed_date,
    )
    session.add(card)
    session.flush()  # Get the ID

    # 7) Create CardColor entries
    for color in colors:
        card_color = CardColor(card_id=card.id, color=color)
        session.add(card_color)

    # Cache only the querying name -> card mapping
    cache.add(normalized_name, card)

    return card, True


def ingest_cards(session: Session, entries: List[Dict[str, Any]]):
    """
    Ingest cards from tournament entries.

    Args:
        session: Database session
        entries: List of tournament entry dictionaries
    """
    print("🃏 Processing cards...")

    # First, extract all unique card names to minimize API calls
    print("  🔍 Extracting unique card names...")
    unique_card_names = extract_unique_card_names(entries)
    print(f"  📊 Found {len(unique_card_names)} unique card names")

    cache = CardCache()
    stats = {
        "processed": 0,
        "new_created": 0,
        "existing_found": 0,
        "skipped_invalid": 0,
        "scryfall_success": 0,
        "scryfall_failed": 0,
        "unique_cards": len(unique_card_names),
        "newly_created_cards": set(),
    }

    # Process each unique card name
    for i, card_name in enumerate(sorted(unique_card_names)):
        normalized_name = normalize_card_name(card_name)

        # Skip if already processed this session
        if cache.is_processed(normalized_name):
            stats["processed"] += 1
            continue

        # Get or create card
        try:
            card, is_new = get_or_create_card(session, cache, card_name)

            # Track statistics
            if is_new:
                stats["new_created"] += 1
                stats["newly_created_cards"].add(card.name)

                # Check if we got Scryfall data
                if card.scryfall_oracle_id:
                    stats["scryfall_success"] += 1
                else:
                    stats["scryfall_failed"] += 1
            else:
                stats["existing_found"] += 1

            cache.mark_processed(normalized_name)
            stats["processed"] += 1

            # Commit immediately to avoid losing this card if next one fails
            session.commit()

        except Exception as e:
            print(f"  ⚠️ Error processing card '{card_name}': {e}")
            session.rollback()
            stats["skipped_invalid"] += 1
            stats["scryfall_failed"] += 1

        # Progress update every 50 cards
        if (i + 1) % 50 == 0:
            print(f"  📊 Processed {i + 1}/{len(unique_card_names)} unique cards...")

    # Print summary
    print("\n📊 Card Ingestion Summary:")
    print(f"  📈 Total cards processed: {stats['processed']}")
    print(f"  ➕ New cards created: {stats['new_created']}")
    print(f"  ✅ Existing cards found: {stats['existing_found']}")
    print(f"  ⚠️ Invalid entries skipped: {stats['skipped_invalid']}")
    print(f"  🃏 Unique cards: {stats['unique_cards']}")
    print(f"  🎯 Scryfall API successes: {stats['scryfall_success']}")
    print(f"  💥 Scryfall API failures: {stats['scryfall_failed']}")

    if stats["newly_created_cards"]:
        print("  🆕 Newly created cards:")
        sorted_cards = sorted(stats["newly_created_cards"])
        for i, name in enumerate(sorted_cards):
            if i >= 50:
                remaining = len(sorted_cards) - 50
                print(f"    ... and {remaining} more cards")
                break
            print(f"    - {name}")
    elif stats["new_created"] == 0:
        print("  ℹ️ No new cards created (all already existed)")
