#!/usr/bin/env python3
"""
Test script for Duel Commander archetype extraction.

This script parses a single Duel Commander tournament JSON file,
extracts commander information, and displays statistics about archetypes.

Usage:
    python src/ingest/test_duel_commander.py <path-to-json-file>

Example:
    python src/ingest/test_duel_commander.py /path/to/duel-commander-trial.json
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Any
from collections import Counter

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from ingest.commander_archetypes import (
    get_commander_archetype,
    extract_commander_from_deck,
    normalize_commander_name,
    load_commander_mappings,
)


def load_tournament_json(file_path: str) -> Dict[str, Any]:
    """Load and parse tournament JSON file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ File not found: {file_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in {file_path}: {e}")
        sys.exit(1)


def analyze_tournament(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze tournament data and extract commander statistics.

    Args:
        data: Tournament JSON data

    Returns:
        dict: Statistics dictionary
    """
    # Extract decks
    decks = data.get("Decks", [])
    if not decks:
        print("⚠️  No decks found in tournament data")
        return {}

    # Load commander mappings once
    mappings = load_commander_mappings()

    # Statistics
    stats = {
        "total_decks": len(decks),
        "commanders_found": 0,
        "commanders_missing": 0,
        "raw_commanders": Counter(),  # Original commander names
        "archetypes": Counter(),  # Normalized archetype names
        "normalization_applied": [],  # List of (raw_name, normalized_name) tuples
    }

    # Process each deck
    for deck in decks:
        # Extract raw commander
        raw_commander = extract_commander_from_deck(deck)

        if not raw_commander:
            stats["commanders_missing"] += 1
            continue

        stats["commanders_found"] += 1
        stats["raw_commanders"][raw_commander] += 1

        # Get normalized archetype
        archetype_name, color = get_commander_archetype(deck)
        if archetype_name:
            stats["archetypes"][archetype_name] += 1

            # Track if normalization was applied
            if archetype_name != raw_commander:
                stats["normalization_applied"].append((raw_commander, archetype_name))

    return stats


def print_statistics(stats: Dict[str, Any], tournament_info: Dict[str, Any]):
    """Print formatted statistics."""
    print("\n" + "=" * 70)
    print("🎯 DUEL COMMANDER ARCHETYPE EXTRACTION TEST")
    print("=" * 70)

    # Tournament info
    print("\n📋 Tournament Information:")
    print(f"  Name: {tournament_info.get('Name', 'Unknown')}")
    print(f"  Date: {tournament_info.get('Date', 'Unknown')}")
    print(f"  URL: {tournament_info.get('Uri', 'N/A')}")

    # Basic stats
    print("\n📊 Basic Statistics:")
    print(f"  Total decks: {stats['total_decks']}")
    print(f"  Commanders found: {stats['commanders_found']}")
    print(f"  Commanders missing: {stats['commanders_missing']}")
    print(f"  Unique raw commanders: {len(stats['raw_commanders'])}")
    print(f"  Unique archetypes (normalized): {len(stats['archetypes'])}")

    # Normalization applied
    if stats["normalization_applied"]:
        print(f"\n✨ Normalizations Applied: {len(stats['normalization_applied'])}")
        # Group by normalized name to show all raw names that map to it
        from collections import defaultdict

        normalized_groups = defaultdict(list)
        for raw, normalized in stats["normalization_applied"]:
            normalized_groups[normalized].append(raw)

        for normalized, raw_list in sorted(normalized_groups.items()):
            unique_raws = sorted(set(raw_list))
            print(f"  '{normalized}' ← {unique_raws}")
    else:
        print("\n✨ No normalizations applied (all commanders use full names)")

    # Top 10 archetypes by presence
    print("\n🏆 Top 10 Archetypes by Presence:")
    if stats["archetypes"]:
        for i, (archetype, count) in enumerate(stats["archetypes"].most_common(10), 1):
            percentage = (count / stats["total_decks"]) * 100
            print(f"  {i:2d}. {archetype:40s} {count:3d} decks ({percentage:5.1f}%)")
    else:
        print("  No archetypes found")

    # All raw commanders (for reference)
    print("\n📝 All Raw Commanders Found:")
    for commander, count in sorted(stats["raw_commanders"].items()):
        print(f"  - {commander:50s} x{count}")

    print("\n" + "=" * 70)


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description="Test Duel Commander archetype extraction"
    )
    parser.add_argument("file", help="Path to Duel Commander tournament JSON file")
    args = parser.parse_args()

    # Validate file
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        sys.exit(1)

    print(f"📂 Loading tournament data from: {file_path.name}")

    # Load tournament data
    data = load_tournament_json(str(file_path))

    # Extract tournament info
    tournament_info = data.get("Tournament", {})

    # Analyze tournament
    stats = analyze_tournament(data)

    # Print statistics
    print_statistics(stats, tournament_info)

    print("\n✅ Test completed successfully!")


if __name__ == "__main__":
    main()
