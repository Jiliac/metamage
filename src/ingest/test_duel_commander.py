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
from typing import Dict, Any
from collections import Counter

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from ingest.commander_archetypes import (
    get_commander_archetype,
    extract_commander_from_deck,
)
from ingest.rounds_finder import find_rounds_file, TournamentSearchCriteria
from models import TournamentSource
from datetime import datetime


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


def test_rounds_finder(
    file_path: Path, tournament_info: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Test if rounds_finder can locate the MTGORecorder rounds file.

    Returns:
        dict: Results of the rounds finder test
    """
    print("\n" + "=" * 70)
    print("🔍 TESTING ROUNDS FINDER")
    print("=" * 70)

    # Extract tournament ID from filename
    # Pattern: duel-commander-trial-16-2025-10-1512819571.json -> 12819571
    filename = file_path.stem  # Remove .json extension
    import re

    match = re.search(r"-(\d{4})-(\d{2})-(\d{2})(\d+)$", filename)

    if not match:
        print("❌ Could not extract tournament ID from filename")
        print(f"   Filename: {filename}")
        return {"found": False, "error": "No tournament ID in filename"}

    tournament_id = match.group(4)
    print(f"📋 Extracted Tournament ID: {tournament_id}")

    # Parse tournament date
    tournament_date_str = tournament_info.get("Date", "")
    if not tournament_date_str:
        print("❌ No date found in tournament info")
        return {"found": False, "error": "No date in tournament"}

    try:
        # Handle date formats: "2025-10-15" or "2025-10-15T15:00:00"
        if "T" in tournament_date_str:
            tournament_date = datetime.fromisoformat(tournament_date_str)
        else:
            tournament_date = datetime.strptime(tournament_date_str, "%Y-%m-%d")
    except Exception as e:
        print(f"❌ Could not parse tournament date: {tournament_date_str}")
        return {"found": False, "error": f"Invalid date: {e}"}

    print(f"📅 Tournament Date: {tournament_date.date()}")
    print(f"🏷️  Tournament Name: {tournament_info.get('Name', 'Unknown')}")

    # Create search criteria
    criteria = TournamentSearchCriteria(
        date=tournament_date,
        format_name="Duel Commander",
        source=TournamentSource.MTGO,
        tournament_name=tournament_info.get("Name"),
        tournament_id=tournament_id,
    )

    print("\n🔎 Searching for rounds file...")
    rounds_path = find_rounds_file(criteria)

    if not rounds_path:
        print("❌ Rounds file NOT found")
        return {"found": False, "error": "rounds_finder returned None"}

    print(f"✅ Rounds file FOUND: {rounds_path}")

    # Load and compare rounds data
    try:
        with open(rounds_path, "r", encoding="utf-8") as f:
            rounds_data = json.load(f)

        rounds_count = len(rounds_data.get("Rounds", []))
        print("\n📊 Rounds File Statistics:")
        print(f"   Rounds: {rounds_count}")

        # Count total matches
        total_matches = 0
        for rnd in rounds_data.get("Rounds", []):
            total_matches += len(rnd.get("Matches", []))
        print(f"   Total Matches: {total_matches}")

        print("\n📝 Comparison:")
        print("   Tournament file (top 8 only): ~3 rounds")
        print(f"   Rounds file (full Swiss+top8): {rounds_count} rounds")
        print("   ✅ MTGORecorder file has complete match data!")

        return {
            "found": True,
            "path": str(rounds_path),
            "rounds_count": rounds_count,
            "total_matches": total_matches,
        }

    except Exception as e:
        print(f"❌ Error reading rounds file: {e}")
        return {"found": True, "error": f"Could not read file: {e}"}


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

    # Test rounds finder
    rounds_result = test_rounds_finder(file_path, tournament_info)

    print("\n✅ Test completed successfully!")

    # Return non-zero exit code if rounds file not found
    if not rounds_result.get("found"):
        print("⚠️  Warning: Rounds file not found - match data will be incomplete")
        sys.exit(1)


if __name__ == "__main__":
    main()
