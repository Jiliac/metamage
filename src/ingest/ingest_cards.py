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

# Scryfall requires User-Agent and Accept headers on every request, otherwise
# they rate-limit aggressively (see https://scryfall.com/docs/api).
SCRYFALL_HEADERS = {
    "User-Agent": "metamage-ingest/1.0",
    "Accept": "application/json",
}
# Scryfall asks for 50–100ms between requests; use 100ms to stay safely under cap.
SCRYFALL_REQUEST_DELAY = 0.1


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


def _scryfall_get(
    url: str, params: Dict[str, Any], context: str
) -> Optional[requests.Response]:
    """
    Perform a GET against Scryfall with required headers and 429 backoff.

    Returns the final Response (which may be 200 or 404), or None if the request
    ultimately failed after retries.
    """
    max_retries = 5
    for attempt in range(max_retries):
        # Pace requests before sending so we never burst.
        time.sleep(SCRYFALL_REQUEST_DELAY)
        try:
            response = requests.get(
                url, params=params, headers=SCRYFALL_HEADERS, timeout=10
            )
        except requests.RequestException as e:
            print(f"  ⚠️ Network error fetching {context}: {e}")
            return None

        if response.status_code != 429:
            return response

        # Honor Retry-After when present, otherwise exponential backoff.
        retry_after = response.headers.get("Retry-After")
        if retry_after is not None:
            try:
                wait = float(retry_after)
            except ValueError:
                wait = 2**attempt
        else:
            wait = 2**attempt
        print(
            f"  ⏳ Scryfall 429 for {context}; backing off {wait:.1f}s "
            f"(attempt {attempt + 1}/{max_retries})"
        )
        time.sleep(wait)

    print(f"  ⚠️ Scryfall gave up after {max_retries} retries for {context}")
    return None


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

    response = _scryfall_get(
        "https://api.scryfall.com/cards/named",
        {"fuzzy": card_name},
        f"'{card_name}'",
    )
    if response is None:
        return None

    if response.status_code == 200:
        data = response.json()
        cache.cache_scryfall_data(card_name, data)
        return data
    if response.status_code == 404:
        cache.cache_scryfall_data(card_name, None)
        return None

    print(f"  ⚠️ Scryfall API error for '{card_name}': HTTP {response.status_code}")
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

    response = _scryfall_get(
        "https://api.scryfall.com/cards/search",
        {
            "q": f"oracle_id:{oracle_id}",
            "unique": "prints",
            "order": "released",
            "dir": "asc",
        },
        f"printings for oracle_id {oracle_id}",
    )
    if response is None:
        return None

    if response.status_code == 200:
        data = response.json()
        printings = data.get("data", [])
        cache.cache_scryfall_data(cache_key, printings)
        return printings
    if response.status_code == 404:
        cache.cache_scryfall_data(cache_key, None)
        return None

    print(
        f"  ⚠️ Scryfall printings API error for oracle_id {oracle_id}: "
        f"HTTP {response.status_code}"
    )
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
