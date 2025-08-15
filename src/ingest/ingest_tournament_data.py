#!/usr/bin/env python3
"""
Main tournament data ingest script.

This script ingests tournament data from JSON files into the database.
It supports ingesting all data types or specific components like archetypes.

Usage:
    python ingest_tournament_data.py -f data.json                 # Ingest all data
    python ingest_tournament_data.py -f data.json --archetype     # Ingest only archetypes
"""

import sys
import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import Base, get_engine, get_session_factory, Format
from ingest.ingest_archetypes import ingest_archetypes
from ingest.ingest_players import ingest_players
from ingest.ingest_cards import ingest_cards
from ingest.ingest_entries import ingest_entries


def extract_format_from_filename(filename: str) -> str:
    """Extract format name from filename (e.g., 'Modern_data.json' -> 'Modern')."""
    path = Path(filename)
    basename = path.stem  # Remove .json extension

    # Extract format before first underscore
    if "_" in basename:
        format_name = basename.split("_")[0]
    else:
        format_name = basename

    return format_name


def load_json_data(file_path: str) -> Dict[str, Any]:
    """Load and parse JSON data from file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ File not found: {file_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in {file_path}: {e}")
        sys.exit(1)


def filter_entries_by_date(
    entries: List[Dict[str, Any]], date_filter: str
) -> List[Dict[str, Any]]:
    """Filter tournament entries to only include those after the specified date."""
    try:
        filter_date = datetime.strptime(date_filter, "%Y-%m-%d")
    except ValueError:
        print(f"❌ Invalid date format: {date_filter}. Use YYYY-MM-DD format.")
        sys.exit(1)

    filtered_entries = []
    for entry in entries:
        # Check if entry has a date field (adjust field name as needed)
        entry_date_str = entry.get("Date")
        if not entry_date_str:
            # Skip entries without dates or include them - adjust based on your needs
            continue

        try:
            # Parse the entry date - ISO format with time
            entry_date = datetime.fromisoformat(entry_date_str)
            if entry_date.date() >= filter_date.date():
                filtered_entries.append(entry)
        except ValueError:
            # Skip entries with invalid date formats
            print(f"⚠️ Skipping entry with invalid date format: {entry_date_str}")
            continue

    return filtered_entries


def get_format_id(session, format_name: str) -> str:
    """Get format ID from database by name."""
    format_obj = session.query(Format).filter(Format.name == format_name).first()
    if not format_obj:
        print(f"❌ Format '{format_name}' not found in database")
        print("Available formats:")
        for fmt in session.query(Format).all():
            print(f"  - {fmt.name}")
        sys.exit(1)
    return format_obj.id


def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Ingest Magic tournament data")
    parser.add_argument("-f", "--file", required=True, help="JSON file to ingest")
    parser.add_argument(
        "--archetypes", action="store_true", help="Ingest only archetypes"
    )
    parser.add_argument("--players", action="store_true", help="Ingest only players")
    parser.add_argument("--cards", action="store_true", help="Ingest only cards")
    parser.add_argument(
        "--entries",
        action="store_true",
        help="Ingest tournaments, entries, deck cards and matches",
    )
    parser.add_argument(
        "--date",
        type=str,
        help="Filter out tournament entries before this date (YYYY-MM-DD format)",
    )

    args = parser.parse_args()

    print("🎯 Magic Tournament Database - Data Ingestion")
    print("=" * 50)

    # Validate file exists
    if not Path(args.file).exists():
        print(f"❌ File not found: {args.file}")
        return

    # Extract format from filename
    format_name = extract_format_from_filename(args.file)
    print(f"📋 Detected format: {format_name}")

    # Load data
    print(f"📂 Loading data from {args.file}...")
    data = load_json_data(args.file)

    if "Data" not in data:
        print("❌ Invalid JSON structure: missing 'Data' key")
        return

    entries = data["Data"]
    print(f"📊 Found {len(entries)} entries")

    # Apply date filter if provided
    if args.date:
        print(f"📅 Filtering entries after {args.date}...")
        entries = filter_entries_by_date(entries, args.date)
        print(f"📊 After date filter: {len(entries)} entries")

    # Initialize database
    engine = get_engine()
    Base.metadata.create_all(engine)

    # Create session
    SessionFactory = get_session_factory()
    session = SessionFactory()

    try:
        # Get format ID
        format_id = get_format_id(session, format_name)
        print(f"✅ Format ID: {format_id}")

        # Determine what to ingest
        any_flag_set = any([args.archetypes, args.players, args.cards, args.entries])

        if args.archetypes:
            print("🎭 Ingesting archetypes...")
            ingest_archetypes(session, entries, format_id)
        if args.players:
            print("👥 Ingesting players...")
            ingest_players(session, entries)
        if args.cards:
            print("🃏 Ingesting cards...")
            ingest_cards(session, entries)
        if args.entries:
            print("🧾 Ingesting tournaments, entries, deck cards and matches...")
            ingest_entries(session, entries, format_id)

        if not any_flag_set:
            print("📦 Ingesting all data types...")
            # Ingest implemented data types
            ingest_archetypes(session, entries, format_id)
            ingest_players(session, entries)
            ingest_cards(session, entries)
            # Now ingest tournaments, entries, deck cards and matches last
            ingest_entries(session, entries, format_id)

        # Commit all changes
        session.commit()
        print("\n✅ Data ingestion completed successfully!")

    except Exception as e:
        print(f"❌ Error during ingestion: {e}")
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
