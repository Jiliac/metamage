"""U7: deck-card ingest path (bulk_save_objects) parity on SQLite and Postgres."""

import os
import sys
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from models import (  # noqa: E402
    Base,
    Format,
    Player,
    Archetype,
    Tournament,
    TournamentEntry,
    Card,
    DeckCard,
    TournamentSource,
    BoardType,
)
from ingest.ingest_entries import upsert_deck_cards_for_entry  # noqa: E402
from ingest.ingest_cards import CardCache  # noqa: E402


def _seed(engine):
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    s.add_all(
        [
            Format(id="f1", name="modern"),
            Player(id="p1", handle="A", normalized_handle="a"),
            Archetype(id="a1", format_id="f1", name="burn"),
            Tournament(
                id="t1",
                name="Cup",
                date=datetime(2026, 1, 1),
                format_id="f1",
                source=TournamentSource.MTGO,
            ),
            TournamentEntry(
                id="e1", tournament_id="t1", player_id="p1", archetype_id="a1"
            ),
            Card(
                id="c1", name="Lightning Bolt", scryfall_oracle_id="o1", is_land=False
            ),
            Card(id="c2", name="Island", scryfall_oracle_id="o2", is_land=True),
        ]
    )
    s.commit()
    return s


def _engines():
    engines = [("sqlite", create_engine("sqlite://"))]
    if os.getenv("TEST_PG_URL"):
        engines.append(("postgres", create_engine(os.environ["TEST_PG_URL"])))
    return engines


@pytest.mark.parametrize("name,engine", _engines())
def test_deck_cards_bulk_insert(name, engine):
    session = _seed(engine)
    try:
        entry = session.get(TournamentEntry, "e1")
        mainboard = [
            {"Count": 4, "CardName": "Lightning Bolt"},
            {"Count": 20, "CardName": "Island"},
        ]
        sideboard = [{"Count": 2, "CardName": "Lightning Bolt"}]

        inserted, skipped, _total = upsert_deck_cards_for_entry(
            session, entry, mainboard, sideboard, CardCache()
        )
        session.commit()

        assert inserted == 3
        assert skipped == 0
        assert session.scalar(select(func.count()).select_from(DeckCard)) == 3

        # Correct counts + board split survived bulk_save_objects.
        main_bolt = session.scalar(
            select(DeckCard.count).where(
                DeckCard.card_id == "c1", DeckCard.board == BoardType.MAIN
            )
        )
        side_bolt = session.scalar(
            select(DeckCard.count).where(
                DeckCard.card_id == "c1", DeckCard.board == BoardType.SIDE
            )
        )
        assert main_bolt == 4
        assert side_bolt == 2

        # Idempotency: re-running skips (entry already has deck cards).
        again = upsert_deck_cards_for_entry(
            session, entry, mainboard, sideboard, CardCache()
        )
        assert again == (0, 0, 0)
    finally:
        session.close()
        Base.metadata.drop_all(engine)
