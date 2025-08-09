#!/usr/bin/env python3
"""
Database initialization script.

This script creates the database schema and can optionally populate
it with initial data.
"""

import sys
from pathlib import Path

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from models import Base, get_engine, get_database_path


def init_database(create_schema=True):
    """Initialize the database.

    Args:
        create_schema (bool): Whether to create the database schema.
                             Set to False if using Alembic migrations.
    """
    print("Initializing Magic tournament database...")

    # Ensure data directory exists
    db_path = Path(get_database_path())
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # Get engine and create schema if requested
    engine = get_engine()

    if create_schema:
        print("Creating database schema...")
        Base.metadata.create_all(engine)
        print(f"Database created at: {db_path}")
    else:
        print(f"Database path: {db_path}")

    print("Database initialization complete!")
    return engine


def drop_database():
    """Drop all tables (for development/testing)."""
    print("WARNING: This will drop all database tables!")
    response = input("Are you sure? (yes/no): ")

    if response.lower() != "yes":
        print("Cancelled.")
        return

    engine = get_engine()
    Base.metadata.drop_all(engine)
    print("All tables dropped.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Initialize Magic tournament database")
    parser.add_argument(
        "--drop", action="store_true", help="Drop all tables (destructive!)"
    )
    parser.add_argument(
        "--no-schema",
        action="store_true",
        help="Don't create schema (use with Alembic)",
    )

    args = parser.parse_args()

    if args.drop:
        drop_database()
    else:
        init_database(create_schema=not args.no_schema)
