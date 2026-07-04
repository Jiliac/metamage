"""U6 backfill: small-fixture SQLite -> Postgres parity and FK integrity."""

import importlib.util
import os
import sys
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from models import (  # noqa: E402
    Base,
    Format,
    Set,
    Player,
    Card,
    Archetype,
    Tournament,
    TournamentEntry,
    DeckCard,
    Match,
    TournamentSource,
    MatchResult,
    BoardType,
)


def _load_migrate_module():
    spec = importlib.util.spec_from_file_location(
        "migrate_tournament", ROOT / "scripts" / "migrate_tournament_to_postgres.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _seed_sqlite(path):
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    now = datetime(2026, 1, 1)
    fmt = Format(id="f1", name="modern")
    st = Set(id="s1", code="ABC", name="Alpha", released_at=now)
    p1 = Player(id="p1", handle="Alice", normalized_handle="alice")
    p2 = Player(id="p2", handle="Bob", normalized_handle="bob")
    card = Card(id="c1", name="lightning bolt", scryfall_oracle_id="o1",
                is_land=False, first_printed_set_id="s1")
    arch = Archetype(id="a1", format_id="f1", name="burn")
    tour = Tournament(id="t1", name="Test Cup", date=now, format_id="f1",
                      source=TournamentSource.MTGO, link=None)
    e1 = TournamentEntry(id="e1", tournament_id="t1", player_id="p1", archetype_id="a1")
    e2 = TournamentEntry(id="e2", tournament_id="t1", player_id="p2", archetype_id="a1")
    dc = DeckCard(id="dc1", entry_id="e1", card_id="c1", count=4, board=BoardType.MAIN)
    m1 = Match(id="m1", entry_id="e1", opponent_entry_id="e2",
               result=MatchResult.WIN, pair_id="pair1")
    m2 = Match(id="m2", entry_id="e2", opponent_entry_id="e1",
               result=MatchResult.LOSS, pair_id="pair1")
    s.add_all([fmt, st, p1, p2, card, arch, tour, e1, e2, dc, m1, m2])
    s.commit()
    s.close()
    return engine


@pytest.mark.skipif(
    not os.getenv("TEST_PG_URL"), reason="TEST_PG_URL not set (no local Postgres)"
)
def test_backfill_parity_and_fk(tmp_path):
    mod = _load_migrate_module()
    sqlite_path = tmp_path / "src.db"
    source_engine = _seed_sqlite(sqlite_path)

    target_url = os.environ["TEST_PG_URL"]
    target_engine = create_engine(target_url)
    Base.metadata.create_all(target_engine)  # bootstrap (stamp validated in U4)

    SourceSession = sessionmaker(bind=source_engine)
    TargetSession = sessionmaker(bind=target_engine)
    src_s, tgt_s = SourceSession(), TargetSession()
    try:
        mod.transfer(src_s, tgt_s, chunk_size=2)
        assert mod.verify(src_s, tgt_s) is True

        # Row-count parity on the heaviest table.
        assert tgt_s.scalar(select(func.count()).select_from(Match)) == 2
        # ORM maps the column back to the enum member on read...
        assert tgt_s.scalar(select(Match.result).where(Match.id == "m1")) == MatchResult.WIN
        # ...and the raw stored value is the plain string (VARCHAR+CHECK, no native enum).
        assert tgt_s.execute(
            text("SELECT result FROM matches WHERE id='m1'")
        ).scalar() == "WIN"
        assert tgt_s.execute(
            text("SELECT source FROM tournaments WHERE id='t1'")
        ).scalar() == "MTGO"
        # FK integrity: a match's entry ids resolve to migrated entries.
        row = tgt_s.execute(
            text(
                "SELECT te.player_id FROM matches m "
                "JOIN tournament_entries te ON te.id = m.entry_id WHERE m.id='m1'"
            )
        ).scalar()
        assert row == "p1"
    finally:
        src_s.close()
        tgt_s.close()
        Base.metadata.drop_all(target_engine)
