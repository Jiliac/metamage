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


def load_duel_commander_directories_from_config() -> List[tuple[str, Path]]:
    """Load Duel Commander tournament directories from config file.

    Returns:
        List of (source_name, directory_path) tuples for DC and MELEE sources
    """
    directories = []

    if not CONFIG_PATH.exists():
        return directories

    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)

        for source_config in config:
            source = source_config.get("source")
            data_folder = source_config.get("data_folder")

            # Look for both DC (MTGO) and MELEE sources
            if source in ["DC", "MELEE"] and data_folder:
                directories.append((source, Path(data_folder)))

    except Exception as e:
        print(f"⚠️  Error loading config: {e}")

    return directories


def scan_duel_commander_files(
    base_dir: Path, source: str, date_filter: Optional[datetime] = None
) -> List[Path]:
    """
    Scan directory tree for Duel Commander tournament files.

    Args:
        base_dir: Base tournaments directory
        source: Source type ("DC" for MTGO, "MELEE" for Melee.gg)
        date_filter: Only include tournaments on or after this date

    Returns:
        List of Path objects to tournament files, sorted by date
    """
    tournament_files = []

    # Define file patterns based on source
    if source == "DC":
        # MTGO pattern: duel-commander-trial*.json
        file_pattern = "*duel-commander-trial*.json"
    elif source == "MELEE":
        # Melee.gg pattern: files containing "duel" in the name
        # This will catch: relic-fest-2025-duel-com-main-event*, legacy-duel-for-the-duals*, etc.
        file_pattern = "*duel*.json"
    else:
        print(f"⚠️  Unknown source: {source}")
        return tournament_files

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

                    # Find Duel Commander files in this day
                    for json_file in day_dir.glob(file_pattern):
                        tournament_files.append(json_file)
    else:
        # No filter - scan everything
        for json_file in base_dir.rglob(file_pattern):
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

    # Get tournament date (for Melee.gg files which have Date at tournament level)
    tournament_date = tournament_info.get("Date", "")

    # Get Rounds and Standings data if present (for Melee.gg files)
    rounds_data = tournament_data.get("Rounds", None)
    standings_data = tournament_data.get("Standings", None)

    for deck in decks:
        # Extract commander and compute archetype
        archetype_name, color = get_commander_archetype(deck)

        if not archetype_name:
            # Skip decks without valid commanders
            continue

        # Use deck date if available and not None (MTGO), otherwise use tournament date (Melee.gg)
        deck_date = deck.get("Date")
        entry_date = deck_date if deck_date is not None else tournament_date

        # Transform to standard entry format
        entry = {
            "Tournament": tournament_name,
            "Date": entry_date,
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

        # For Melee.gg files, include the Rounds and Standings data directly in the entry
        # This allows ingest_entries to use it without searching for external files
        if rounds_data or standings_data:
            entry["_rounds_data"] = {
                "Rounds": rounds_data or [],
                "Standings": standings_data or [],
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
        help="Tournament directory (default: load from config)",
    )
    parser.add_argument(
        "-s",
        "--source",
        type=str,
        choices=["all", "mtgo", "melee"],
        default="all",
        help="Data source to ingest (default: all)",
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

    # Determine tournament directories based on source
    source_directories = []

    if args.directory:
        # Manual directory specified - need to infer source or use provided source
        tournament_dir = Path(args.directory)
        if not tournament_dir.exists():
            print(f"❌ Tournament directory not found: {tournament_dir}")
            sys.exit(1)

        # Infer source from directory path if possible
        if "mtgo" in str(tournament_dir).lower() or args.source == "mtgo":
            source_directories.append(("DC", tournament_dir))
        elif "melee" in str(tournament_dir).lower() or args.source == "melee":
            source_directories.append(("MELEE", tournament_dir))
        else:
            # Default to MTGO for backward compatibility
            source_directories.append(("DC", tournament_dir))
    else:
        # Load from config based on source filter
        all_directories = load_duel_commander_directories_from_config()
        if not all_directories:
            print("❌ No tournament directories found in config")
            print(
                "   Please specify --directory or configure data/config_tournament.json"
            )
            sys.exit(1)

        # Filter based on source argument
        if args.source == "all":
            source_directories = all_directories
        elif args.source == "mtgo":
            source_directories = [(s, p) for s, p in all_directories if s == "DC"]
        elif args.source == "melee":
            source_directories = [(s, p) for s, p in all_directories if s == "MELEE"]

    if not source_directories:
        print(f"❌ No directories found for source: {args.source}")
        sys.exit(1)

    print(f"📂 Processing {len(source_directories)} source(s):")
    for source, path in source_directories:
        print(f"   - {source}: {path}")

    # Parse date filter
    try:
        date_filter = datetime.strptime(args.date, "%Y-%m-%d")
        print(f"📅 Date filter: {args.date} (on or after)")
    except ValueError:
        print(f"❌ Invalid date format: {args.date}. Use YYYY-MM-DD format.")
        sys.exit(1)

    # Scan for tournament files across all sources
    print("\n🔍 Scanning for Duel Commander tournament files...")
    all_tournament_files = []
    source_file_counts = {}

    for source, directory in source_directories:
        print(f"  Scanning {source} in {directory}...")
        tournament_files = scan_duel_commander_files(directory, source, date_filter)
        source_file_counts[source] = len(tournament_files)
        all_tournament_files.extend([(source, f) for f in tournament_files])
        print(f"    Found {len(tournament_files)} files")

    if not all_tournament_files:
        print("❌ No Duel Commander tournament files found")
        sys.exit(0)

    print(f"\n📊 Total files found: {len(all_tournament_files)}")
    for source, count in source_file_counts.items():
        print(f"   - {source}: {count} files")

    # Load and transform all tournaments
    print("\n📦 Loading and transforming tournament data...")
    all_entries = []
    tournaments_processed = 0
    tournaments_skipped = 0

    for source, tournament_file in all_tournament_files:
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
                    f"  📊 Processed {tournaments_processed}/{len(all_tournament_files)} tournaments..."
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
