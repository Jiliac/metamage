#!/usr/bin/env python3
"""
Cleanup orphaned archetypes script.

This script finds archetypes that have no tournament entries pointing to them
and optionally deletes them from the database after user confirmation.
"""

import sys
from pathlib import Path

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from models import get_engine, get_session_factory, Archetype, TournamentEntry
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text


def find_orphaned_archetypes(session):
    """Find archetypes with no tournament entries."""
    # Query for archetypes that have no tournament entries
    orphaned_query = text("""
        SELECT a.id, a.name, a.color, f.name as format_name
        FROM archetypes a
        JOIN formats f ON a.format_id = f.id
        LEFT JOIN tournament_entries te ON a.id = te.archetype_id
        WHERE te.archetype_id IS NULL
        ORDER BY f.name, a.name
    """)

    result = session.execute(orphaned_query)
    return result.fetchall()


def delete_orphaned_archetypes(session, orphaned_ids):
    """Delete orphaned archetypes by their IDs."""
    if not orphaned_ids:
        return 0

    deleted_count = (
        session.query(Archetype)
        .filter(Archetype.id.in_(orphaned_ids))
        .delete(synchronize_session=False)
    )

    session.commit()
    return deleted_count


def main():
    """Main function to find and optionally delete orphaned archetypes."""
    print("Finding orphaned archetypes (archetypes with no tournament entries)...")

    # Get database session
    engine = get_engine()
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Find orphaned archetypes
        orphaned = find_orphaned_archetypes(session)

        if not orphaned:
            print("No orphaned archetypes found.")
            return

        # Display found orphaned archetypes
        print(f"\nFound {len(orphaned)} orphaned archetype(s):")
        print("-" * 60)
        print(f"{'Format':<15} {'Archetype':<30} {'Color':<8}")
        print("-" * 60)

        for row in orphaned:
            archetype_id, name, color, format_name = row
            color_str = color or "None"
            print(f"{format_name:<15} {name:<30} {color_str:<8}")

        print("-" * 60)

        # Ask for confirmation to delete
        print(f"\nThis will DELETE {len(orphaned)} archetype(s) from the database.")
        print("This action cannot be undone!")

        response = (
            input("Do you want to proceed with deletion? (yes/no): ").strip().lower()
        )

        if response == "yes":
            # Extract IDs for deletion
            orphaned_ids = [row[0] for row in orphaned]

            # Delete orphaned archetypes
            deleted_count = delete_orphaned_archetypes(session, orphaned_ids)
            print(f"\nSuccessfully deleted {deleted_count} orphaned archetype(s).")
        else:
            print("\nDeletion cancelled. No changes made.")

    except Exception as e:
        print(f"Error: {e}")
        session.rollback()
        return 1
    finally:
        session.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
