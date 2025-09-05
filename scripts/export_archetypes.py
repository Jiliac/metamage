#!/usr/bin/env python3
"""
Export all archetypes with their format and last tournament entry date.
Outputs CSV format: archetype,format,last_entry_date
"""

import sqlite3
import sys
from pathlib import Path


def get_database_path():
    """Get the path to the tournament database."""
    return Path(__file__).parent.parent / "data" / "tournament.db"


def export_archetypes():
    """Export archetypes to CSV format."""
    db_path = get_database_path()

    if not db_path.exists():
        print(f"Error: Database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))

    query = """
    SELECT 
        a.name as archetype,
        f.name as format,
        DATE(MAX(t.date)) as last_entry_date
    FROM archetypes a
    JOIN formats f ON a.format_id = f.id
    JOIN tournament_entries te ON a.id = te.archetype_id
    JOIN tournaments t ON te.tournament_id = t.id
    GROUP BY a.id, a.name, f.name
    ORDER BY last_entry_date DESC, f.name, a.name
    """

    cursor = conn.cursor()
    cursor.execute(query)

    # Print CSV header
    print("archetype,format,last_entry_date")

    # Print data rows
    for row in cursor.fetchall():
        archetype, format_name, last_date = row
        # Handle None dates (archetypes with no tournament entries)
        last_date = last_date if last_date else ""
        # Escape commas in archetype names by quoting
        if "," in archetype:
            archetype = f'"{archetype}"'
        if "," in format_name:
            format_name = f'"{format_name}"'
        print(f"{archetype},{format_name},{last_date}")

    conn.close()


if __name__ == "__main__":
    export_archetypes()
