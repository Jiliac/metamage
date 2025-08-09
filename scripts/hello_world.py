#!/usr/bin/env python3
"""
Hello World database demo script.

This script demonstrates basic database operations:
1. Create the database if it doesn't exist
2. Add a sample format
3. Query and display all formats
4. Delete the sample format
5. Show the table is empty again
"""

import sys
from pathlib import Path

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from models import Base, get_engine, get_session_factory, Format


def main():
    print("🎯 Magic Tournament Database - Hello World Demo")
    print("=" * 50)

    # Initialize database
    engine = get_engine()
    Base.metadata.create_all(engine)
    print("✅ Database initialized")

    # Create session
    SessionFactory = get_session_factory()
    session = SessionFactory()

    try:
        # Step 1: Show initial state (should be empty)
        print("\n📋 Initial formats in database:")
        formats = session.query(Format).all()
        if formats:
            for fmt in formats:
                print(
                    f"  - {fmt.name} (ID: {fmt.id}, Created: {fmt.created_at}, Updated: {fmt.updated_at})"
                )
        else:
            print("  (empty)")

        # Step 2: Create a new format
        print("\n➕ Adding new format: 'ABCD Test Format'")
        new_format = Format(name="ABCD Test Format")
        session.add(new_format)
        session.commit()
        print(f"✅ Format added with UUID: {new_format.id}")

        # Step 3: Query and display all formats
        print("\n📋 All formats after adding:")
        formats = session.query(Format).all()
        for fmt in formats:
            print(
                f"  - {fmt.name} (ID: {fmt.id}, Created: {fmt.created_at}, Updated: {fmt.updated_at})"
            )

        # Step 4: Delete the format we just created
        print(f"\n🗑️  Deleting format with UUID: {new_format.id}")
        session.delete(new_format)
        session.commit()
        print("✅ Format deleted")

        # Step 5: Show final state (should be back to original)
        print("\n📋 Final formats in database:")
        formats = session.query(Format).all()
        if formats:
            for fmt in formats:
                print(
                    f"  - {fmt.name} (ID: {fmt.id}, Created: {fmt.created_at}, Updated: {fmt.updated_at})"
                )
        else:
            print("  (empty)")

        print("\n🎉 Hello World demo completed successfully!")

    except Exception as e:
        print(f"❌ Error: {e}")
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
