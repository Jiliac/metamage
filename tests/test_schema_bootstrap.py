"""Schema bootstrap parity across SQLite and Postgres.

The tournament schema is bootstrapped with ``Base.metadata.create_all`` (the
established pattern — the ingest itself calls it), then ``alembic stamp head``
marks the version for future incremental migrations. These tests assert the
create_all schema is dialect-portable: all tables present, and the four Enum
columns render as VARCHAR + CHECK (native_enum=False) rather than native PG
ENUM types, so no ``CREATE TYPE`` is emitted on Postgres.
"""

import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from models import Base, Tournament, Match, DeckCard, MetaChange  # noqa: E402

EXPECTED_TABLES = {
    "formats",
    "sets",
    "players",
    "cards",
    "card_colors",
    "archetypes",
    "archetype_aliases",
    "meta_changes",
    "tournaments",
    "tournament_entries",
    "deck_cards",
    "matches",
}

ENUM_COLUMNS = [
    ("tournaments", "source"),
    ("deck_cards", "board"),
    ("matches", "result"),
    ("meta_changes", "change_type"),
]


def _bootstrap(url):
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    return engine


def test_enums_are_non_native():
    # native_enum=False is what keeps create_all portable to Postgres.
    columns = [
        Tournament.__table__.c.source,
        Match.__table__.c.result,
        DeckCard.__table__.c.board,
        MetaChange.__table__.c.change_type,
    ]
    for col in columns:
        assert col.type.native_enum is False


def test_create_all_sqlite_in_memory():
    engine = _bootstrap("sqlite://")
    insp = inspect(engine)
    assert EXPECTED_TABLES.issubset(set(insp.get_table_names()))
    for table, column in ENUM_COLUMNS:
        col = next(c for c in insp.get_columns(table) if c["name"] == column)
        assert (
            "VARCHAR" in str(col["type"]).upper() or "CHAR" in str(col["type"]).upper()
        )


@pytest.mark.skipif(
    not os.getenv("TEST_PG_URL"), reason="TEST_PG_URL not set (no local Postgres)"
)
def test_create_all_postgres():
    # Use a dedicated schema-less throwaway; caller points TEST_PG_URL at an empty DB.
    engine = _bootstrap(os.environ["TEST_PG_URL"])
    try:
        insp = inspect(engine)
        assert EXPECTED_TABLES.issubset(set(insp.get_table_names()))
        # No native ENUM types should have been created.
        with engine.connect() as conn:
            from sqlalchemy import text

            rows = conn.execute(
                text("SELECT typname FROM pg_type WHERE typtype = 'e'")
            ).fetchall()
        assert rows == [], f"unexpected native enum types created: {rows}"
        for table, column in ENUM_COLUMNS:
            col = next(c for c in insp.get_columns(table) if c["name"] == column)
            assert "VARCHAR" in str(col["type"]).upper()
    finally:
        Base.metadata.drop_all(engine)
