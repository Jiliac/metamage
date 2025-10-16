"""
Duel Commander tournament data ingest script.

This script ingests Duel Commander tournament data from individual JSON files
in the MTGO tournament directory structure into the database.

Usage:
    python ingest_duel_commander.py --date 2025-09-01                 # Ingest all data
    python ingest_duel_commander.py --date 2025-09-01 --archetypes    # Ingest only archetypes
    python ingest_duel_commander.py --date 2025-09-01 --directory ~/path/to/mtgo/tournaments
"""

import sys
import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import Base, get_engine, get_session_factory, Format
from ingest.ingest_archetypes import ingest_archetypes
from ingest.ingest_players import ingest_players
from ingest.ingest_cards import ingest_cards
from ingest.ingest_entries import ingest_entries
from ingest.commander_archetypes import get_commander_archetype


CONFIG_PATH = Path("data/config_tournament.json")


def load_duel_commander_directory_from_config() -> Optional[Path]:
    """Load Duel Commander tournament directory from config file."""
    if not CONFIG_PATH.exists():
        return None

    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)

        for source_config in config:
            # Look for DC (Duel Commander) source which points to decklistcache
            if source_config.get("source") == "DC":
                data_folder = source_config.get("data_folder")
                if data_folder:
                    return Path(data_folder)
    except Exception as e:
        print(f"⚠️  Error loading config: {e}")

    return None


def scan_duel_commander_files(
    base_dir: Path, date_filter: Optional[datetime] = None
) -> List[Path]:
    """
    Scan directory tree for duel-commander-trial*.json files.

    Args:
        base_dir: Base MTGO tournaments directory
        date_filter: Only include tournaments on or after this date

    Returns:
        List of Path objects to tournament files, sorted by date
    """
    tournament_files = []

    # If date filter provided, only scan relevant year/month/day directories
    if date_filter:
        start_year = date_filter.year
        start_month = date_filter.month
        start_day = date_filter.day

        # Scan from filter date onwards
        for year in range(start_year, datetime.now().year + 1):
            year_dir = base_dir / f"{year:04d}"
            if not year_dir.exists():
                continue

            # Determine month range
            month_start = start_month if year == start_year else 1
            month_end = 12

            for month in range(month_start, month_end + 1):
                month_dir = year_dir / f"{month:02d}"
                if not month_dir.exists():
                    continue

                # Determine day range
                day_start = (
                    start_day if (year == start_year and month == start_month) else 1
                )
                day_end = 31  # Will skip non-existent days naturally

                for day in range(day_start, day_end + 1):
                    day_dir = month_dir / f"{day:02d}"
                    if not day_dir.exists():
                        continue

                    # Find duel-commander-trial files in this day
                    for json_file in day_dir.glob("*duel-commander-trial*.json"):
                        tournament_files.append(json_file)
    else:
        # No filter - scan everything
        for json_file in base_dir.rglob("*duel-commander-trial*.json"):
            tournament_files.append(json_file)

    return sorted(tournament_files)


def extract_tournament_id_from_filename(filename: str) -> Optional[str]:
    """
    Extract tournament ID from Duel Commander filename.

    Args:
        filename: Filename like 'duel-commander-trial-16-2025-10-1512819571.json'

    Returns:
        Tournament ID string (e.g., '12819571') or None if not found
    """
    # Pattern: duel-commander-trial-XX-YYYY-MM-DDID.json
    match = re.search(r"-(\d{4})-(\d{2})-(\d{2})(\d+)$", Path(filename).stem)
    if match:
        return match.group(4)
    return None


def load_tournament_file(file_path: Path) -> Dict[str, Any]:
    """Load and parse a tournament JSON file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ File not found: {file_path}")
        return {}
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in {file_path}: {e}")
        return {}


def transform_tournament_to_entries(
    tournament_data: Dict[str, Any], file_path: Path
) -> List[Dict[str, Any]]:
    """
    Transform a Duel Commander tournament file into standard entry format.

    Args:
        tournament_data: Parsed tournament JSON data
        file_path: Path to the tournament file (for TournamentFile field)

    Returns:
        List of transformed entries matching the format expected by ingest modules
    """
    entries = []

    tournament_info = tournament_data.get("Tournament", {})
    decks = tournament_data.get("Decks", [])

    if not tournament_info or not decks:
        return entries

    tournament_name = tournament_info.get("Name", "")
    tournament_url = tournament_info.get("Uri", "")
    tournament_file_stem = file_path.stem  # For rounds_finder

    for deck in decks:
        # Extract commander and compute archetype
        archetype_name, color = get_commander_archetype(deck)

        if not archetype_name:
            # Skip decks without valid commanders
            continue

        # Transform to standard entry format
        entry = {
            "Tournament": tournament_name,
            "Date": deck.get("Date", ""),
            "AnchorUri": deck.get("AnchorUri", tournament_url),
            "Player": deck.get("Player", ""),
            "Archetype": {
                "Archetype": archetype_name,
                "Color": color or "",
            },
            "Mainboard": deck.get("Mainboard", []),
            "Sideboard": deck.get("Sideboard", []),
            "TournamentFile": tournament_file_stem,  # For rounds_finder to match
        }

        entries.append(entry)

    return entries


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
    parser = argparse.ArgumentParser(
        description="Ingest Duel Commander tournament data"
    )
    parser.add_argument(
        "-d",
        "--directory",
        type=str,
        help="MTGO tournaments directory (default: load from config)",
    )
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
        required=True,
        help="Filter tournaments on or after this date (YYYY-MM-DD format)",
    )

    args = parser.parse_args()

    print("🎯 Duel Commander Tournament Database - Data Ingestion")
    print("=" * 50)

    # Determine tournament directory
    if args.directory:
        tournament_dir = Path(args.directory)
    else:
        tournament_dir = load_duel_commander_directory_from_config()
        if not tournament_dir:
            print("❌ No tournament directory specified and config not found")
            print(
                "   Please specify --directory or configure data/config_tournament.json"
            )
            sys.exit(1)

    if not tournament_dir.exists():
        print(f"❌ Tournament directory not found: {tournament_dir}")
        sys.exit(1)

    print(f"📂 Tournament Directory: {tournament_dir}")

    # Parse date filter
    try:
        date_filter = datetime.strptime(args.date, "%Y-%m-%d")
        print(f"📅 Date filter: {args.date} (on or after)")
    except ValueError:
        print(f"❌ Invalid date format: {args.date}. Use YYYY-MM-DD format.")
        sys.exit(1)

    # Scan for tournament files
    print("\n🔍 Scanning for Duel Commander trial files...")
    tournament_files = scan_duel_commander_files(tournament_dir, date_filter)

    if not tournament_files:
        print("❌ No Duel Commander trial files found")
        sys.exit(0)

    print(f"📊 Found {len(tournament_files)} tournament files")

    # Load and transform all tournaments
    print("\n📦 Loading and transforming tournament data...")
    all_entries = []
    tournaments_processed = 0
    tournaments_skipped = 0

    for tournament_file in tournament_files:
        tournament_data = load_tournament_file(tournament_file)

        if not tournament_data:
            tournaments_skipped += 1
            continue

        entries = transform_tournament_to_entries(tournament_data, tournament_file)

        if entries:
            all_entries.extend(entries)
            tournaments_processed += 1

            if tournaments_processed % 10 == 0:
                print(
                    f"  📊 Processed {tournaments_processed}/{len(tournament_files)} tournaments..."
                )

    print("\n📊 Transformation Summary:")
    print(f"  🏟️  Tournaments processed: {tournaments_processed}")
    print(f"  ⚠️  Tournaments skipped: {tournaments_skipped}")
    print(f"  📝 Total entries: {len(all_entries)}")

    if not all_entries:
        print("❌ No entries to ingest")
        sys.exit(0)

    # Initialize database
    engine = get_engine()
    Base.metadata.create_all(engine)

    # Create session
    SessionFactory = get_session_factory()
    session = SessionFactory()

    try:
        # Get format ID for Duel Commander
        format_id = get_format_id(session, "duel-commander")
        print(f"✅ Format ID: {format_id}")

        # Determine what to ingest
        any_flag_set = any([args.archetypes, args.players, args.cards, args.entries])

        if args.archetypes:
            print("\n🎭 Ingesting archetypes...")
            ingest_archetypes(session, all_entries, format_id)
            session.commit()

        if args.players:
            print("\n👥 Ingesting players...")
            ingest_players(session, all_entries)
            session.commit()

        if args.cards:
            print("\n🃏 Ingesting cards...")
            ingest_cards(session, all_entries)
            session.commit()

        if args.entries:
            print("\n🧾 Ingesting tournaments, entries, deck cards and matches...")
            ingest_entries(session, all_entries, format_id)
            session.commit()

        if not any_flag_set:
            print("\n📦 Ingesting all data types...")
            # Ingest in dependency order
            ingest_archetypes(session, all_entries, format_id)
            session.commit()
            ingest_players(session, all_entries)
            session.commit()
            ingest_cards(session, all_entries)
            session.commit()
            ingest_entries(session, all_entries, format_id)
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
