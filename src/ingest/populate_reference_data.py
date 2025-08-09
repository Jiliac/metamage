#!/usr/bin/env python3
"""
Populate reference data script.

This script populates the formats and meta_changes tables using data from:
- data/bans.csv: Ban and unban information
- data/sets.csv: Set release information
"""

import sys
import csv
from pathlib import Path
from datetime import datetime
from typing import Set

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import Base, get_engine, get_session_factory, Format, MetaChange, ChangeType


def parse_date(date_str: str) -> datetime:
    """Parse date string in YYYY-MM-DD format."""
    return datetime.strptime(date_str, "%Y-%m-%d")


def extract_formats_from_bans(bans_file: Path) -> Set[str]:
    """Extract unique format names from bans CSV."""
    formats = set()
    with open(bans_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            formats.add(row['format'])
    return formats


def populate_formats(session, formats: Set[str]) -> dict:
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


def populate_ban_changes(session, bans_file: Path, format_mapping: dict):
    """Populate meta changes from bans CSV."""
    print("🚫 Populating ban/unban changes...")
    
    with open(bans_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date = parse_date(row['date'])
            format_obj = format_mapping[row['format']]
            description = row['notes']
            
            # Check if this exact change already exists
            existing = session.query(MetaChange).filter(
                MetaChange.format_id == format_obj.id,
                MetaChange.date == date,
                MetaChange.change_type == ChangeType.BAN,
                MetaChange.description == description
            ).first()
            
            if existing:
                print(f"  ✅ Ban change for {row['format']} on {row['date']} already exists")
            else:
                change = MetaChange(
                    format_id=format_obj.id,
                    date=date,
                    change_type=ChangeType.BAN,
                    description=description
                )
                session.add(change)
                print(f"  ➕ Added ban change: {row['format']} on {row['date']}")


def populate_set_changes(session, sets_file: Path, format_mapping: dict):
    """Populate meta changes from sets CSV."""
    print("📦 Populating set release changes...")
    
    # We'll add set releases for formats where they're relevant
    # Standard format gets all sets, eternal formats get eternal sets
    with open(sets_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date = parse_date(row['release_date'])
            set_name = row['set_name']
            set_code = row['set_code']
            is_eternal = row['eternal_set'].upper() == 'TRUE'
            
            # Determine which formats this set affects
            affected_formats = []
            
            if 'Standard' in format_mapping:
                affected_formats.append('Standard')
            
            # Eternal sets affect all eternal formats
            if is_eternal:
                for format_name in ['Modern', 'Legacy', 'Vintage', 'Pioneer', 'Pauper']:
                    if format_name in format_mapping:
                        affected_formats.append(format_name)
            
            for format_name in affected_formats:
                format_obj = format_mapping[format_name]
                description = f"{set_name} released"
                
                # Check if this exact change already exists
                existing = session.query(MetaChange).filter(
                    MetaChange.format_id == format_obj.id,
                    MetaChange.date == date,
                    MetaChange.change_type == ChangeType.SET_RELEASE,
                    MetaChange.set_code == set_code
                ).first()
                
                if existing:
                    print(f"  ✅ Set release {set_code} for {format_name} already exists")
                else:
                    change = MetaChange(
                        format_id=format_obj.id,
                        date=date,
                        change_type=ChangeType.SET_RELEASE,
                        description=description,
                        set_code=set_code
                    )
                    session.add(change)
                    print(f"  ➕ Added set release: {set_code} ({set_name}) for {format_name}")


def main():
    """Main function to populate reference data."""
    print("🎯 Magic Tournament Database - Reference Data Population")
    print("=" * 60)
    
    # File paths
    project_root = Path(__file__).parent.parent.parent
    bans_file = project_root / "data" / "bans.csv"
    sets_file = project_root / "data" / "sets.csv"
    
    # Check files exist
    if not bans_file.exists():
        print(f"❌ Bans file not found: {bans_file}")
        return
    if not sets_file.exists():
        print(f"❌ Sets file not found: {sets_file}")
        return
    
    # Initialize database
    engine = get_engine()
    Base.metadata.create_all(engine)
    print("✅ Database initialized")
    
    # Create session
    SessionFactory = get_session_factory()
    session = SessionFactory()
    
    try:
        # Extract formats from bans CSV
        formats = extract_formats_from_bans(bans_file)
        print(f"📋 Found {len(formats)} formats: {', '.join(sorted(formats))}")
        
        # Populate formats
        format_mapping = populate_formats(session, formats)
        
        # Populate ban changes
        populate_ban_changes(session, bans_file, format_mapping)
        
        # Populate set changes
        populate_set_changes(session, sets_file, format_mapping)
        
        # Commit all changes
        session.commit()
        print("\n✅ All reference data populated successfully!")
        
        # Show summary
        format_count = session.query(Format).count()
        change_count = session.query(MetaChange).count()
        print(f"📊 Summary:")
        print(f"   - Formats: {format_count}")
        print(f"   - Meta changes: {change_count}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()