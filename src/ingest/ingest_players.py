"""
Player ingestion module.

Handles the ingestion of player data from tournament JSON files.
Supports minimal normalization and caching for performance.
"""

from typing import Dict, List, Any, Set
from sqlalchemy.orm import Session

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.reference import Player


class PlayerCache:
    """In-memory cache for players to avoid duplicate database lookups."""

    def __init__(self):
        self.cache: Dict[str, Player] = {}  # normalized_handle -> Player
        self.processed: Set[str] = set()  # Track what we've seen this session

    def get(self, normalized_handle: str) -> Player:
        """Get player from cache."""
        return self.cache.get(normalized_handle)

    def add(self, normalized_handle: str, player: Player):
        """Add player to cache."""
        self.cache[normalized_handle] = player

    def is_processed(self, normalized_handle: str) -> bool:
        """Check if we've already processed this player in this session."""
        return normalized_handle in self.processed

    def mark_processed(self, normalized_handle: str):
        """Mark player as processed in this session."""
        self.processed.add(normalized_handle)


def normalize_player_handle(handle: str) -> str:
    """
    Normalize player handle for duplicate detection.

    Only performs minimal normalization:
    - Lowercase conversion
    - Whitespace trimming
    - Preserves all other characters (underscores, numbers, etc.)

    Examples:
        "mehanske" -> "mehanske"
        "MEHANSKE" -> "mehanske"
        "_against_" -> "_against_"
        "NMT_Sco94" -> "nmt_sco94"
    """
    return handle.strip().lower()


def extract_player_handle(entry: Dict[str, Any]) -> str:
    """
    Extract player handle from a tournament entry.

    Returns:
        str: Player handle or None if invalid/missing
    """
    handle = entry.get("Player", "").strip()
    return handle if handle else None


def get_or_create_player(
    session: Session, cache: PlayerCache, handle: str
) -> tuple[Player, bool]:
    """
    Get existing player or create a new one.
    Uses cache for performance optimization.

    Returns:
        tuple: (Player, is_new) where is_new=True if player was just created
    """
    normalized_handle = normalize_player_handle(handle)

    # Check cache first
    player = cache.get(normalized_handle)
    if player:
        return player, False

    # Check database
    player = (
        session.query(Player)
        .filter(Player.normalized_handle == normalized_handle)
        .first()
    )

    if player:
        # Add to cache
        cache.add(normalized_handle, player)
        return player, False

    # Create new player
    player = Player(handle=handle, normalized_handle=normalized_handle)
    session.add(player)
    session.flush()  # Get the ID

    # Add to cache
    cache.add(normalized_handle, player)

    return player, True


def ingest_players(session: Session, entries: List[Dict[str, Any]]):
    """
    Ingest players from tournament entries.

    Args:
        session: Database session
        entries: List of tournament entry dictionaries
    """
    print("👥 Processing players...")

    cache = PlayerCache()
    stats = {
        "processed": 0,
        "new_created": 0,
        "existing_found": 0,
        "skipped_invalid": 0,
        "unique_players": set(),
        "newly_created_players": set(),
    }

    for i, entry in enumerate(entries):
        if (i + 1) % 5000 == 0:
            print(f"  📊 Processed {i + 1}/{len(entries)} entries...")

        # Extract player handle
        handle = extract_player_handle(entry)

        if not handle:
            stats["skipped_invalid"] += 1
            continue

        normalized_handle = normalize_player_handle(handle)

        # Skip if already processed this session
        if cache.is_processed(normalized_handle):
            stats["processed"] += 1
            continue

        # Get or create player
        try:
            player, is_new = get_or_create_player(session, cache, handle)

            # Track statistics
            if is_new:
                stats["new_created"] += 1
                stats["newly_created_players"].add(handle)
            else:
                stats["existing_found"] += 1

            stats["unique_players"].add(handle)
            cache.mark_processed(normalized_handle)
            stats["processed"] += 1

        except Exception as e:
            print(f"  ⚠️ Error processing player '{handle}': {e}")
            stats["skipped_invalid"] += 1

    # Print summary
    print("\n📊 Player Ingestion Summary:")
    print(f"  📈 Total entries processed: {stats['processed']}")
    print(f"  ➕ New players created: {stats['new_created']}")
    print(f"  ✅ Existing players found: {stats['existing_found']}")
    print(f"  ⚠️ Invalid entries skipped: {stats['skipped_invalid']}")
    print(f"  👥 Unique players: {len(stats['unique_players'])}")

    if stats["newly_created_players"]:
        print("  🆕 Newly created players:")
        sorted_players = sorted(stats["newly_created_players"])
        for i, handle in enumerate(sorted_players):
            if i >= 50:
                remaining = len(sorted_players) - 50
                print(f"    ... and {remaining} more players")
                break
            print(f"    - {handle}")
    elif stats["new_created"] == 0:
        print("  ℹ️ No new players created (all already existed)")
