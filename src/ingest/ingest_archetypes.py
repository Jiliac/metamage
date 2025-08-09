"""
Archetype ingestion module.

Handles the ingestion of archetype data from tournament JSON files.
Supports conflict archetype normalization and caching for performance.
"""

import re
from typing import Dict, List, Any, Set
from sqlalchemy.orm import Session

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.reference import Archetype


class ArchetypeCache:
    """In-memory cache for archetypes to avoid duplicate database lookups."""

    def __init__(self):
        self.cache: Dict[tuple, Archetype] = {}  # (format_id, name) -> Archetype
        self.processed: Set[tuple] = set()  # Track what we've seen this session

    def get(self, format_id: str, name: str) -> Archetype:
        """Get archetype from cache."""
        return self.cache.get((format_id, name))

    def add(self, format_id: str, name: str, archetype: Archetype):
        """Add archetype to cache."""
        self.cache[(format_id, name)] = archetype

    def is_processed(self, format_id: str, name: str) -> bool:
        """Check if we've already processed this archetype in this session."""
        return (format_id, name) in self.processed

    def mark_processed(self, format_id: str, name: str):
        """Mark archetype as processed in this session."""
        self.processed.add((format_id, name))


def normalize_archetype_name(name: str) -> str:
    """
    Normalize archetype names, handling conflict archetypes.

    Examples:
        "Rakdos Madness" -> "Rakdos Madness"
        "Conflict(Mono Blue Delver, Dimir Control)" -> "conflict"
    """
    if re.match(r"^Conflict\(.*\)$", name.strip()):
        return "conflict"
    return name.strip()


def extract_archetype_data(entry: Dict[str, Any]) -> tuple:
    """
    Extract archetype information from a tournament entry.

    Returns:
        tuple: (normalized_name, color) or (None, None) if invalid
    """
    if "Archetype" not in entry:
        return None, None

    archetype_data = entry["Archetype"]
    if not isinstance(archetype_data, dict):
        return None, None

    raw_name = archetype_data.get("Archetype", "").strip()
    color = archetype_data.get("Color", "").strip() or None

    if not raw_name:
        return None, None

    normalized_name = normalize_archetype_name(raw_name)
    return normalized_name, color


def get_or_create_archetype(
    session: Session,
    cache: ArchetypeCache,
    format_id: str,
    name: str,
    color: str = None,
) -> Archetype:
    """
    Get existing archetype or create a new one.
    Uses cache for performance optimization.
    """
    # Check cache first
    archetype = cache.get(format_id, name)
    if archetype:
        return archetype

    # Check database
    archetype = (
        session.query(Archetype)
        .filter(Archetype.format_id == format_id, Archetype.name == name)
        .first()
    )

    if archetype:
        # Add to cache
        cache.add(format_id, name, archetype)
        return archetype

    # Create new archetype
    archetype = Archetype(format_id=format_id, name=name, color=color)
    session.add(archetype)
    session.flush()  # Get the ID

    # Add to cache
    cache.add(format_id, name, archetype)

    return archetype


def ingest_archetypes(session: Session, entries: List[Dict[str, Any]], format_id: str):
    """
    Ingest archetypes from tournament entries.

    Args:
        session: Database session
        entries: List of tournament entry dictionaries
        format_id: Format ID to associate archetypes with
    """
    print(f"🎭 Processing archetypes for format {format_id}...")

    cache = ArchetypeCache()
    stats = {
        "processed": 0,
        "new_created": 0,
        "existing_found": 0,
        "skipped_invalid": 0,
        "unique_archetypes": set(),
    }

    for i, entry in enumerate(entries):
        if (i + 1) % 5000 == 0:
            print(f"  📊 Processed {i + 1}/{len(entries)} entries...")

        # Extract archetype data
        archetype_name, color = extract_archetype_data(entry)

        if not archetype_name:
            stats["skipped_invalid"] += 1
            continue

        # Skip if already processed this session
        if cache.is_processed(format_id, archetype_name):
            stats["processed"] += 1
            continue

        # Get or create archetype
        try:
            archetype = get_or_create_archetype(
                session, cache, format_id, archetype_name, color
            )

            # Track statistics
            if archetype.id in [a.id for a in session.new]:
                stats["new_created"] += 1
            else:
                stats["existing_found"] += 1

            stats["unique_archetypes"].add(archetype_name)
            cache.mark_processed(format_id, archetype_name)
            stats["processed"] += 1

        except Exception as e:
            print(f"  ⚠️ Error processing archetype '{archetype_name}': {e}")
            stats["skipped_invalid"] += 1

    # Print summary
    print("\n📊 Archetype Ingestion Summary:")
    print(f"  📈 Total entries processed: {stats['processed']}")
    print(f"  ➕ New archetypes created: {stats['new_created']}")
    print(f"  ✅ Existing archetypes found: {stats['existing_found']}")
    print(f"  ⚠️ Invalid entries skipped: {stats['skipped_invalid']}")
    print(f"  🎭 Unique archetypes: {len(stats['unique_archetypes'])}")

    if stats["unique_archetypes"]:
        print("  📋 Archetype names:")
        for name in sorted(stats["unique_archetypes"]):
            print(f"    - {name}")
