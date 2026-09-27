"""U6 backfill: small-fixture SQLite -> Postgres parity, dedupe and FK integrity."""

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

needs_postgres = pytest.mark.skipif(
    not os.getenv("TEST_PG_URL"), reason="TEST_PG_URL not set (no local Postgres)"
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
    # colors: None = never ingested, "" = ingested as colorless. COPY must keep
    # the two apart (cards.colors='' is the documented colorless encoding).
    card = Card(
        id="c1",
        name="lightning bolt",
        scryfall_oracle_id="o1",
        is_land=False,
        first_printed_set_id="s1",
    )
    colorless = Card(
        id="c2",
        name="ornithopter",
        scryfall_oracle_id="o2",
        is_land=False,
        colors="",
        first_printed_set_id="s1",
    )
    arch = Archetype(id="a1", format_id="f1", name="burn")
    tour = Tournament(
        id="t1",
        name="Test Cup",
        date=now,
        format_id="f1",
        source=TournamentSource.MTGO,
        link=None,
    )
    e1 = TournamentEntry(id="e1", tournament_id="t1", player_id="p1", archetype_id="a1")
    e2 = TournamentEntry(id="e2", tournament_id="t1", player_id="p2", archetype_id="a1")
    dc = DeckCard(id="dc1", entry_id="e1", card_id="c1", count=4, board=BoardType.MAIN)
    m1 = Match(
        id="m1",
        entry_id="e1",
        opponent_entry_id="e2",
        result=MatchResult.WIN,
        pair_id="pair1",
    )
    m2 = Match(
        id="m2",
        entry_id="e2",
        opponent_entry_id="e1",
        result=MatchResult.LOSS,
        pair_id="pair1",
    )
    s.add_all([fmt, st, p1, p2, card, colorless, arch, tour, e1, e2, dc, m1, m2])
    s.commit()
    s.close()
    return engine


def _inject_case_collision(source_engine, canonical_owns_alias=False):
    """Add the legacy data bug: 'Burn' next to 'burn', with an entry and alias.

    Raw SQL bypasses the CaseInsensitiveText shim, exactly like the legacy
    write path that produced the real 'Tasigur' row. With canonical_owns_alias
    the lowercase twin also owns an alias, so the duplicate's alias cannot be
    re-pointed (archetype_aliases.archetype_id is UNIQUE).
    """
    s = sessionmaker(bind=source_engine)()
    statements = [
        "INSERT INTO archetypes (id, name, format_id) VALUES ('a2', 'Burn', 'f1')",
        "INSERT INTO players (id, handle, normalized_handle)"
        " VALUES ('p3', 'Carol', 'carol')",
        "INSERT INTO tournament_entries (id, tournament_id, player_id, archetype_id,"
        " wins, losses, draws, rank) VALUES ('e3', 't1', 'p3', 'a2', 0, 0, 0, 0)",
        "INSERT INTO archetype_aliases (id, alias, archetype_id)"
        " VALUES ('al1', 'fire', 'a2')",
    ]
    if canonical_owns_alias:
        statements.append(
            "INSERT INTO archetype_aliases (id, alias, archetype_id)"
            " VALUES ('al0', 'fire2', 'a1')"
        )
    for stmt in statements:
        s.execute(text(stmt))
    s.commit()
    s.close()


@pytest.fixture
def pg_target():
    """Throwaway target schema on TEST_PG_URL; dropped after the test."""
    engine = create_engine(os.environ["TEST_PG_URL"])
    Base.metadata.create_all(engine)  # bootstrap (stamp validated in U4)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def sessions(tmp_path, pg_target):
    """(migrate module, source session, target session) over a seeded source."""
    mod = _load_migrate_module()
    source_engine = _seed_sqlite(tmp_path / "src.db")
    src_s = sessionmaker(bind=source_engine)()
    tgt_s = sessionmaker(bind=pg_target)()
    try:
        yield mod, source_engine, src_s, tgt_s
    finally:
        src_s.close()
        tgt_s.close()


def _scalar(session, sql: str):
    return session.execute(text(sql)).scalar()


def test_find_archetype_collisions_groups_by_format_and_lowercase(tmp_path):
    """Pure SQLite-side detection; runs without Postgres."""
    mod = _load_migrate_module()
    source_engine = _seed_sqlite(tmp_path / "src.db")
    s = sessionmaker(bind=source_engine)()
    for stmt in [
        "INSERT INTO formats (id, name) VALUES ('f2', 'legacy')",
        # mixed-case twin of the seeded lowercase 'burn' -> lowercase wins
        "INSERT INTO archetypes (id, name, format_id) VALUES ('a2', 'Burn', 'f1')",
        # no lowercase member -> smallest id wins
        "INSERT INTO archetypes (id, name, format_id) VALUES ('a3', 'Tasigur', 'f1')",
        "INSERT INTO archetypes (id, name, format_id) VALUES ('a4', 'TASIGUR', 'f1')",
        # same lowercased name in another format is not a collision
        "INSERT INTO archetypes (id, name, format_id) VALUES ('a5', 'burn', 'f2')",
        # three-member group folds onto one canonical
        "INSERT INTO archetypes (id, name, format_id) VALUES ('a6', 'Storm', 'f1')",
        "INSERT INTO archetypes (id, name, format_id) VALUES ('a7', 'storm', 'f1')",
        "INSERT INTO archetypes (id, name, format_id) VALUES ('a8', 'STORM', 'f1')",
    ]:
        s.execute(text(stmt))
    s.commit()
    try:
        remap = mod.find_archetype_collisions(s)
    finally:
        s.close()
    assert remap == {"a2": "a1", "a4": "a3", "a6": "a7", "a8": "a7"}


def test_copy_cell_keeps_empty_string_distinct_from_null():
    mod = _load_migrate_module()
    assert mod._copy_cell(None) == mod.COPY_NULL
    assert mod._copy_cell("") == ""
    assert mod._copy_cell(True) == "t"
    assert mod._copy_cell(MatchResult.WIN) == "WIN"


@needs_postgres
def test_backfill_parity_and_fk(sessions):
    mod, _, src_s, tgt_s = sessions
    remap = mod.find_archetype_collisions(src_s)
    assert remap == {}  # this fixture has no case collisions
    _, dedupe = mod.transfer(src_s, tgt_s, chunk_size=2, archetype_remap=remap)
    assert dedupe == {"skipped": {}, "remapped": {}}
    assert mod.verify(src_s, tgt_s, remap, dedupe["skipped"]) is True

    # Row-count parity on the heaviest table.
    assert tgt_s.scalar(select(func.count()).select_from(Match)) == 2
    # ORM maps the column back to the enum member on read...
    assert tgt_s.scalar(select(Match.result).where(Match.id == "m1")) == MatchResult.WIN
    # ...and the raw stored value is the plain string (VARCHAR+CHECK, no native enum).
    assert _scalar(tgt_s, "SELECT result FROM matches WHERE id='m1'") == "WIN"
    assert _scalar(tgt_s, "SELECT source FROM tournaments WHERE id='t1'") == "MTGO"
    # COPY keeps '' (colorless) distinct from NULL (never ingested).
    assert _scalar(tgt_s, "SELECT colors FROM cards WHERE id='c2'") == ""
    assert _scalar(tgt_s, "SELECT colors IS NULL FROM cards WHERE id='c1'") is True
    # FK integrity: a match's entry ids resolve to migrated entries.
    assert (
        _scalar(
            tgt_s,
            "SELECT te.player_id FROM matches m "
            "JOIN tournament_entries te ON te.id = m.entry_id WHERE m.id='m1'",
        )
        == "p1"
    )


@needs_postgres
def test_backfill_case_collision_dedupe(sessions):
    """Legacy rows differing only by case ('Burn' vs 'burn') violate
    UNIQUE(format_id, name) once the Postgres shim lowercases both. The
    backfill must fold the mixed-case duplicate into its canonical twin and
    re-point FK references (mirrors the real 'Tasigur' row in prod data).
    """
    mod, source_engine, src_s, tgt_s = sessions
    _inject_case_collision(source_engine)

    remap = mod.find_archetype_collisions(src_s)
    assert remap == {"a2": "a1"}  # lowercase row is the canonical twin

    _, dedupe = mod.transfer(src_s, tgt_s, chunk_size=2, archetype_remap=remap)
    assert dedupe["skipped"] == {"archetypes": 1}
    assert dedupe["remapped"] == {"tournament_entries": 1, "archetype_aliases": 1}
    # Without the merge accounted for, archetypes sqlite=2 vs postgres=1 MISMATCHes.
    assert mod.verify(src_s, tgt_s, {}, {}) is False
    # Parity and the value-level merge checks hold with the dedupe accounted for.
    assert mod.verify(src_s, tgt_s, remap, dedupe["skipped"]) is True

    # The duplicate row never landed; everything it owned points at the twin.
    assert tgt_s.scalar(select(func.count()).select_from(Archetype)) == 1
    assert (
        _scalar(tgt_s, "SELECT archetype_id FROM tournament_entries WHERE id='e3'")
        == "a1"
    )
    assert (
        _scalar(tgt_s, "SELECT archetype_id FROM archetype_aliases WHERE id='al1'")
        == "a1"
    )
    # Canonical row kept the lowercase stored name (shim invariant).
    assert _scalar(tgt_s, "SELECT name FROM archetypes WHERE id='a1'") == "burn"


@needs_postgres
def test_backfill_alias_fanin_drops_duplicate_alias(sessions):
    """When both twins own an alias, re-pointing the duplicate's alias would
    violate UNIQUE(archetype_aliases.archetype_id). The canonical keeps its
    own alias; the duplicate's is dropped and counted as skipped so parity
    stays honest.
    """
    mod, source_engine, src_s, tgt_s = sessions
    _inject_case_collision(source_engine, canonical_owns_alias=True)

    remap = mod.find_archetype_collisions(src_s)
    _, dedupe = mod.transfer(src_s, tgt_s, chunk_size=2, archetype_remap=remap)
    assert dedupe["skipped"] == {"archetypes": 1, "archetype_aliases": 1}
    assert dedupe["remapped"] == {"tournament_entries": 1}
    assert mod.verify(src_s, tgt_s, remap, dedupe["skipped"]) is True

    rows = tgt_s.execute(
        text("SELECT id, alias, archetype_id FROM archetype_aliases ORDER BY id")
    ).all()
    assert [tuple(r) for r in rows] == [("al0", "fire2", "a1")]


@needs_postgres
def test_transfer_failure_rolls_back_before_readding_fk(sessions, pg_target):
    """A COPY that fails mid-table leaves target_session's transaction aborted
    but still holding ROW EXCLUSIVE on that table. The FK re-add runs on a
    separate connection and must not queue behind it: the original error
    propagates promptly and the relaxed FK is back in place.
    """
    mod, _, src_s, tgt_s = sessions
    real_copy = mod._copy_batch

    def copy_then_fail(target_session, model, rows):
        real_copy(target_session, model, rows)  # take the table lock for real
        if model.__tablename__ == "tournament_entries":
            raise RuntimeError("simulated COPY failure")

    mod._copy_batch = copy_then_fail
    with pytest.raises(RuntimeError, match="simulated COPY failure"):
        mod.transfer_with_relaxed_fks(src_s, tgt_s, pg_target, 2, {})

    with pg_target.connect() as conn:
        fk = conn.execute(
            text(
                "SELECT convalidated FROM pg_constraint"
                " WHERE conname = 'fk_tournament_entries_tournament'"
            )
        ).all()
        assert [tuple(r) for r in fk] == [(False,)]  # present, NOT VALID
        assert (
            conn.execute(text("SELECT count(*) FROM tournament_entries")).scalar() == 0
        )
