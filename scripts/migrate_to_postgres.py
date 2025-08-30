#!/usr/bin/env python3
"""
Migration script to transfer data from SQLite to PostgreSQL (Neon).

This script:
1. Reads data from the existing SQLite database
2. Sets up the PostgreSQL database with the latest schema
3. Transfers all data from SQLite to PostgreSQL
4. Verifies data integrity

Usage:
    POSTGRES_URL=postgresql://... uv run scripts/migrate_to_postgres.py

Environment variables:
    POSTGRES_URL: PostgreSQL connection string (required)
    BRIDGE_DB_PATH: Path to SQLite database (optional, defaults to data/bridge.db)
"""

import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from ops_model.base import Base
from ops_model.models import FocusedChannel, DiscordPost, SocialMessage, Pass

# Load environment variables
load_dotenv()


def get_sqlite_engine():
    """Get SQLite engine for the source database."""
    sqlite_path = os.getenv("BRIDGE_DB_PATH", "data/bridge.db")
    sqlite_path = os.path.abspath(sqlite_path)

    if not os.path.exists(sqlite_path):
        raise FileNotFoundError(f"SQLite database not found at: {sqlite_path}")

    return create_engine(f"sqlite:///{sqlite_path}")


def get_postgres_engine():
    """Get PostgreSQL engine for the target database."""
    postgres_url = os.getenv("POSTGRES_URL")

    if not postgres_url:
        raise ValueError("POSTGRES_URL environment variable is required")

    return create_engine(
        postgres_url,
        pool_pre_ping=True,
        pool_recycle=3600,
    )


def create_postgres_schema(postgres_engine):
    """Create the PostgreSQL schema using Alembic migrations."""
    print("Creating PostgreSQL schema...")

    # Create all tables
    Base.metadata.create_all(postgres_engine)

    print("✅ PostgreSQL schema created")


def transfer_data(sqlite_engine, postgres_engine):
    """Transfer all data from SQLite to PostgreSQL."""
    print("Starting data transfer...")

    # Create sessions
    SQLiteSession = sessionmaker(bind=sqlite_engine)
    PostgresSession = sessionmaker(bind=postgres_engine)

    sqlite_session = SQLiteSession()
    postgres_session = PostgresSession()

    try:
        # Define transfer order (respecting foreign key dependencies)
        transfer_models = [
            (FocusedChannel, "focused_channels"),
            (Pass, "passes"),
            (DiscordPost, "discord_posts"),
            (SocialMessage, "social_messages"),
        ]

        total_transferred = 0

        for model_class, table_name in transfer_models:
            print(f"\nTransferring {table_name}...")

            # Get all records from SQLite
            sqlite_records = sqlite_session.query(model_class).all()

            if not sqlite_records:
                print(f"  No records found in {table_name}")
                continue

            # Transfer records to PostgreSQL
            transferred_count = 0
            for record in sqlite_records:
                # Create a new instance with the same data
                record_dict = {}
                for column in model_class.__table__.columns:
                    record_dict[column.name] = getattr(record, column.name)

                new_record = model_class(**record_dict)
                postgres_session.add(new_record)
                transferred_count += 1

            postgres_session.commit()
            total_transferred += transferred_count
            print(f"  ✅ Transferred {transferred_count} records")

        print(f"\n🎉 Successfully transferred {total_transferred} total records")

    except Exception as e:
        postgres_session.rollback()
        raise e
    finally:
        sqlite_session.close()
        postgres_session.close()


def verify_data(sqlite_engine, postgres_engine):
    """Verify that data was transferred correctly."""
    print("\nVerifying data integrity...")

    SQLiteSession = sessionmaker(bind=sqlite_engine)
    PostgresSession = sessionmaker(bind=postgres_engine)

    sqlite_session = SQLiteSession()
    postgres_session = PostgresSession()

    try:
        models_to_verify = [
            (FocusedChannel, "focused_channels"),
            (Pass, "passes"),
            (DiscordPost, "discord_posts"),
            (SocialMessage, "social_messages"),
        ]

        all_verified = True

        for model_class, table_name in models_to_verify:
            sqlite_count = sqlite_session.query(model_class).count()
            postgres_count = postgres_session.query(model_class).count()

            if sqlite_count == postgres_count:
                print(f"  ✅ {table_name}: {sqlite_count} records")
            else:
                print(
                    f"  ❌ {table_name}: SQLite={sqlite_count}, PostgreSQL={postgres_count}"
                )
                all_verified = False

        if all_verified:
            print(
                "\n🎉 Data integrity verified - all records transferred successfully!"
            )
        else:
            print("\n❌ Data integrity check failed - some records may be missing")
            return False

        return True

    finally:
        sqlite_session.close()
        postgres_session.close()


def main():
    """Main migration function."""
    print("🚀 Starting SQLite to PostgreSQL migration...")

    try:
        # Get database engines
        sqlite_engine = get_sqlite_engine()
        postgres_engine = get_postgres_engine()

        print("Source: SQLite database")
        print("Target: PostgreSQL (Neon)")

        # Test connections
        print("\nTesting database connections...")
        with sqlite_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("  ✅ SQLite connection successful")

        with postgres_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("  ✅ PostgreSQL connection successful")

        # Create PostgreSQL schema
        create_postgres_schema(postgres_engine)

        # Transfer data
        transfer_data(sqlite_engine, postgres_engine)

        # Verify data
        if verify_data(sqlite_engine, postgres_engine):
            print("\n✅ Migration completed successfully!")
            print("\nNext steps:")
            print("1. Set POSTGRES_URL in your .env file")
            print("2. Test your application with the new database")
            print("3. Consider backing up your SQLite database")
        else:
            print("\n❌ Migration completed with errors - please check the data")
            sys.exit(1)

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
