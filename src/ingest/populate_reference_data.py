#!/usr/bin/env python3
"""
Populate reference data script.

This script populates the formats and meta_changes tables using data from:
- data/bans.csv: Ban and unban information
- data/sets.csv: Set release information

Idempotent: rows already in meta_changes are skipped. Writes through
TOURNAMENT_DATABASE_WRITE_URL when set (the read URL is a SELECT-only role on
Postgres). `--dry-run` reports what would be added, then rolls back.
"""

import argparse
import csv
import sys
from collections.abc import Mapping
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import Base, Format, MetaChange, ChangeType
from models.base import get_write_engine


# Formats that receive every set release (all sets are legal on release).
ETERNAL_FORMATS = ["modern", "legacy", "vintage", "pauper", "duel-commander"]
# Formats that additionally receive Standard-legal (non-eternal) sets.
ROTATING_FORMATS = ["standard", "pioneer"]

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DEFAULT_BANS_FILE = DATA_DIR / "bans.csv"
DEFAULT_SETS_FILE = DATA_DIR / "sets.csv"


def parse_date(date_str: str) -> datetime:
    """Parse date string in YYYY-MM-DD format."""
    return datetime.strptime(date_str.strip(), "%Y-%m-%d")


def format_slug(name: str) -> str:
    """CSV format label -> DB format name ("Duel Commander" -> "duel-commander")."""
    return "-".join(name.strip().lower().split())


def formats_for_set(row: Mapping[str, str]) -> list[str]:
    """Format slugs a sets.csv row applies to.

    An optional `formats` column (semicolon-separated labels) scopes a set to
    specific formats, e.g. a product that only changes Pauper legality.
    Otherwise eternal sets hit the eternal formats and Standard-legal sets hit
    every format.
    """
    scoped = (row.get("formats") or "").strip()
    if scoped:
        return [format_slug(f) for f in scoped.split(";") if f.strip()]
    if row["eternal_set"].strip().upper() == "TRUE":
        return list(ETERNAL_FORMATS)
    return ETERNAL_FORMATS + ROTATING_FORMATS


def describe_target(engine: Engine) -> str:
    """Dialect + host/database of an engine, never its credentials."""
    url = engine.url
    location = f"{url.host}/{url.database}" if url.host else url.database
    return f"{url.get_backend_name()} {location}"


def extract_formats_from_bans(bans_file: Path) -> set[str]:
    """Extract unique format slugs from bans CSV."""
    formats = set()
    with open(bans_file, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            formats.add(format_slug(row["format"]))
    return formats


def populate_formats(session: Session, formats: set[str]) -> dict[str, Format]:
    """Populate the formats table and return a mapping of name -> format object."""
    print("📋 Populating formats table...")

    format_mapping = {}

    for format_name in sorted(formats):
        # Check if format already exists
        existing = session.query(Format).filter(Format.name == format_name).first()
        if existing:
            print(f"  ✅ Format '{format_name}' already exists (ID: {existing.id})")
            format_mapping[format_name] = existing
        else:
            new_format = Format(name=format_name)
            session.add(new_format)
            session.flush()  # Get the ID
            print(f"  ➕ Added format '{format_name}' (ID: {new_format.id})")
            format_mapping[format_name] = new_format

    return format_mapping


def populate_ban_changes(
    session: Session, bans_file: Path, format_mapping: dict[str, Format]
) -> None:
    """Populate meta changes from bans CSV."""
    print("🚫 Populating ban/unban changes...")

    with open(bans_file, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            date = parse_date(row["date"])
            format_obj = format_mapping[format_slug(row["format"])]
            description = row["notes"]

            # Check if this exact change already exists
            existing = (
                session.query(MetaChange)
                .filter(
                    MetaChange.format_id == format_obj.id,
                    MetaChange.date == date,
                    MetaChange.change_type == ChangeType.BAN,
                    MetaChange.description == description,
                )
                .first()
            )

            if existing:
                print(
                    f"  ✅ Ban change for {row['format']} on {row['date']} already exists"
                )
            else:
                change = MetaChange(
                    format_id=format_obj.id,
                    date=date,
                    change_type=ChangeType.BAN,
                    description=description,
                )
                session.add(change)
                print(f"  ➕ Added ban change: {row['format']} on {row['date']}")


def populate_set_changes(
    session: Session, sets_file: Path, format_mapping: dict[str, Format]
) -> None:
    """Populate meta changes from sets CSV."""
    print("📦 Populating set release changes...")

    with open(sets_file, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            date = parse_date(row["release_date"])
            set_name = row["set_name"]
            set_code = row["set_code"]
            causes_rotation = row["standard_rotation"].strip().upper() == "TRUE"

            affected_formats = formats_for_set(row)
            # A typo in the `formats` column must fail loudly, not load 0 rows.
            unknown = [slug for slug in affected_formats if slug not in format_mapping]
            if unknown:
                raise ValueError(
                    f"sets.csv row {set_name} ({set_code}): unknown format(s) "
                    f"{', '.join(unknown)} in `formats`"
                )

            for format_name in affected_formats:
                format_obj = format_mapping[format_name]

                # Create description based on whether it causes rotation
                if causes_rotation and format_name == "standard":
                    description = f"{set_name} released (Standard rotation)"
                else:
                    description = f"{set_name} released"

                # Check if this exact change already exists
                existing = (
                    session.query(MetaChange)
                    .filter(
                        MetaChange.format_id == format_obj.id,
                        MetaChange.date == date,
                        MetaChange.change_type == ChangeType.SET_RELEASE,
                        MetaChange.set_code == set_code,
                    )
                    .first()
                )

                if existing:
                    print(
                        f"  ✅ Set release {set_code} for {format_name} already exists"
                    )
                else:
                    change = MetaChange(
                        format_id=format_obj.id,
                        date=date,
                        change_type=ChangeType.SET_RELEASE,
                        description=description,
                        set_code=set_code,
                    )
                    session.add(change)
                    print(
                        f"  ➕ Added set release: {set_code} ({set_name}) for {format_name}"
                    )


def parse_args() -> argparse.Namespace:
    """CLI flags; the CSV paths are overridable (tests point them at fixtures)."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="flush new rows to report them, then roll back; creates no tables",
    )
    parser.add_argument("--bans-file", type=Path, default=DEFAULT_BANS_FILE)
    parser.add_argument("--sets-file", type=Path, default=DEFAULT_SETS_FILE)
    return parser.parse_args()


def main() -> None:
    """Main function to populate reference data."""
    args = parse_args()
    dry_run = args.dry_run
    bans_file = args.bans_file
    sets_file = args.sets_file

    # .env is found by walking up from this file, so worktrees reuse the main
    # checkout's. Done here, not at import, so importing (tests) never
    # repoints the process at the live DB. Already-set env vars win.
    load_dotenv()

    print("🎯 Magic Tournament Database - Reference Data Population")
    print("=" * 60)

    # Check files exist
    if not bans_file.exists():
        print(f"❌ Bans file not found: {bans_file}")
        sys.exit(1)
    if not sets_file.exists():
        print(f"❌ Sets file not found: {sets_file}")
        sys.exit(1)

    # Initialize database. TOURNAMENT_DATABASE_WRITE_URL wins over the read
    # URL; get_write_engine() warns if Postgres falls back to the read URL.
    engine = get_write_engine()
    print(f"🔌 Target database: {describe_target(engine)}")
    if dry_run:
        # DDL autocommits, so a dry run must not create tables.
        missing = [
            table
            for table in (Format.__tablename__, MetaChange.__tablename__)
            if not inspect(engine).has_table(table)
        ]
        if missing:
            print(f"❌ Dry run needs existing tables, missing: {', '.join(missing)}")
            engine.dispose()
            sys.exit(1)
    else:
        Base.metadata.create_all(engine)
        print("✅ Database initialized")

    # Create session
    session = Session(bind=engine)

    try:
        # Extract formats from bans CSV
        formats = extract_formats_from_bans(bans_file) | set(
            ETERNAL_FORMATS + ROTATING_FORMATS
        )
        print(f"📋 Found {len(formats)} formats: {', '.join(sorted(formats))}")

        # Populate formats
        format_mapping = populate_formats(session, formats)

        # Populate ban changes
        populate_ban_changes(session, bans_file, format_mapping)

        # Populate set changes
        populate_set_changes(session, sets_file, format_mapping)

        if dry_run:
            session.flush()  # surface constraint errors before rolling back
            session.rollback()
            print("\n🧪 Dry run: rolled back, nothing written.")
            return

        # Commit all changes
        session.commit()
        print("\n✅ All reference data populated successfully!")

        # Show summary
        format_count = session.query(Format).count()
        change_count = session.query(MetaChange).count()
        print("📊 Summary:")
        print(f"   - Formats: {format_count}")
        print(f"   - Meta changes: {change_count}")

    except Exception as e:
        print(f"❌ Error: {e}")
        session.rollback()
        raise
    finally:
        session.close()
        engine.dispose()


if __name__ == "__main__":
    main()
