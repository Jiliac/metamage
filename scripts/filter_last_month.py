#!/usr/bin/env python3
"""
Filter and analyze tournament data from the last month.

This script queries the database for recent tournament data
and can be used for analysis and reporting.
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from models import (
    get_session_factory,
    Tournament,
    Format,
    TournamentEntry,
    Archetype,
)
from sqlalchemy import func


def hello_world_db():
    """Test database connection with a simple query."""
    print("=" * 60)
    print("Hello World from MTG Tournament Database!")
    print("=" * 60)

    Session = get_session_factory()
    session = Session()

    try:
        # Get basic statistics
        total_tournaments = session.query(func.count(Tournament.id)).scalar()
        total_formats = session.query(func.count(Format.id)).scalar()
        total_entries = session.query(func.count(TournamentEntry.id)).scalar()
        total_archetypes = session.query(func.count(Archetype.id)).scalar()

        print("\nDatabase Statistics:")
        print(f"  Formats:     {total_formats:,}")
        print(f"  Tournaments: {total_tournaments:,}")
        print(f"  Entries:     {total_entries:,}")
        print(f"  Archetypes:  {total_archetypes:,}")

        # Get the most recent tournament
        latest = session.query(Tournament).order_by(Tournament.date.desc()).first()
        if latest:
            print("\nMost Recent Tournament:")
            print(f"  Name: {latest.name}")
            print(f"  Date: {latest.date}")
            print(f"  Source: {latest.source.value}")

        print("\n" + "=" * 60)

    finally:
        session.close()


def filter_last_month():
    """Filter tournaments from the last month."""
    print("\n" + "=" * 60)
    print("Filtering Last Month of Tournament Data")
    print("=" * 60)

    Session = get_session_factory()
    session = Session()

    try:
        # Calculate date range (last 30 days)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)

        print("\nDate Range:")
        print(f"  From: {start_date.strftime('%Y-%m-%d')}")
        print(f"  To:   {end_date.strftime('%Y-%m-%d')}")

        # Query tournaments in the last month
        tournaments = (
            session.query(Tournament)
            .filter(Tournament.date >= start_date)
            .filter(Tournament.date <= end_date)
            .order_by(Tournament.date.desc())
            .all()
        )

        print(f"\nTournaments Found: {len(tournaments)}")

        if tournaments:
            # Group by format
            format_counts = {}
            for t in tournaments:
                format_name = t.format.name if t.format else "Unknown"
                format_counts[format_name] = format_counts.get(format_name, 0) + 1

            print("\nTournaments by Format:")
            for format_name, count in sorted(
                format_counts.items(), key=lambda x: x[1], reverse=True
            ):
                print(f"  {format_name}: {count}")

            # Show a few recent tournaments
            print("\nRecent Tournaments (showing up to 5):")
            for t in tournaments[:5]:
                entries_count = len(t.entries) if t.entries else 0
                print(f"  {t.date.strftime('%Y-%m-%d')} - {t.name}")
                print(f"    Format: {t.format.name if t.format else 'Unknown'}")
                print(f"    Entries: {entries_count}")

        print("\n" + "=" * 60)

    finally:
        session.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Filter and analyze tournament data from the last month"
    )
    parser.add_argument(
        "--hello",
        action="store_true",
        help="Run hello world test query",
    )

    args = parser.parse_args()

    if args.hello:
        hello_world_db()
    else:
        # Run both by default
        hello_world_db()
        filter_last_month()
