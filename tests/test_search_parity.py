"""U5: fuzzy-search parity on Postgres.

The fuzzy search uses portable LOWER(...) LIKE LOWER(:pattern) SQL (no FTS5,
no strftime). These tests prove player/archetype/card search return the same
results on Postgres as on SQLite. Run on both engines when TEST_PG_URL is set.
"""

import os
import sys
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from models import Base, Player, Archetype, Format, Card, Set  # noqa: E402
from analysis.player import _find_player_fuzzy  # noqa: E402
from analysis.archetype import _find_archetype_fuzzy  # noqa: E402
from analysis.card import search_card  # noqa: E402


def _seed(engine):
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    s.add_all(
        [
            Format(id="f1", name="Modern"),
            Player(id="p1", handle="MisterBolt", normalized_handle="misterbolt"),
            Archetype(id="a1", format_id="f1", name="Izzet Prowess"),
            Set(id="s1", code="ABC", name="Alpha", released_at=datetime(2026, 1, 1)),
            Card(id="c1", name="Lightning Bolt", scryfall_oracle_id="o1", is_land=False),
        ]
    )
    s.commit()
    s.close()


def _engines():
    engines = [("sqlite", create_engine("sqlite://"))]
    if os.getenv("TEST_PG_URL"):
        engines.append(("postgres", create_engine(os.environ["TEST_PG_URL"])))
    return engines


@pytest.mark.parametrize("name,engine", _engines())
def test_player_fuzzy_partial_match(name, engine):
    _seed(engine)
    try:
        # Partial, different case than stored — LOWER() on both sides must match.
        hit = _find_player_fuzzy(engine, "bolt")
        assert hit is not None and hit["id"] == "p1"
    finally:
        Base.metadata.drop_all(engine)


@pytest.mark.parametrize("name,engine", _engines())
def test_archetype_fuzzy_partial_match(name, engine):
    _seed(engine)
    try:
        hit = _find_archetype_fuzzy(engine, "prowess")
        assert hit is not None and hit["id"] == "a1"
    finally:
        Base.metadata.drop_all(engine)


@pytest.mark.parametrize("name,engine", _engines())
def test_card_search_partial_match(name, engine):
    _seed(engine)
    try:
        res = search_card(engine, "bolt")
        # search_card returns a dict; the matched card name should surface.
        blob = str(res).lower()
        assert "bolt" in blob
    finally:
        Base.metadata.drop_all(engine)
