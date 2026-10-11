"""scripts/backfill_card_data.py: KTD3 bulk backfill from a local oracle file.

Hand-built Scryfall dicts and a local JSONL fixture; no network.
"""

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from models import Base, Card  # noqa: E402


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "backfill_card_data",
        ROOT / "scripts" / "backfill_card_data.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bcd = _load_module()

# --- Scryfall-shaped fixtures -------------------------------------------------

BOLT = {
    "object": "card",
    "name": "Lightning Bolt",
    "lang": "en",
    "layout": "normal",
    "oracle_id": "oid-bolt",
    "type_line": "Instant",
    "mana_cost": "{R}",
    "cmc": 1.0,
    "image_uris": {"normal": "https://img/bolt.jpg"},
    "scryfall_uri": "https://scryfall.com/card/lea/161/bolt",
    "id": "print-bolt",
}

FINKS = {
    "object": "card",
    "name": "Kitchen Finks // Kitchen Finks",
    "lang": "en",
    "layout": "modal_dfc",
    "oracle_id": "oid-finks",
    "cmc": 3.0,
    "scryfall_uri": "https://scryfall.com/card/shm/245/finks",
    "id": "print-finks",
    "card_faces": [
        {
            "name": "Kitchen Finks",
            "type_line": "Creature — Ouphe",
            "mana_cost": "{1}{W/B}{W/B}",
            "image_uris": {"normal": "https://img/finks-front.jpg"},
        },
        {
            "name": "Kitchen Finks",
            "type_line": "Creature — Ouphe",
            "mana_cost": "{1}{B/G}{B/G}",
            "image_uris": {"normal": "https://img/finks-back.jpg"},
        },
    ],
}

REVERSIBLE = {
    "object": "card",
    "name": "Reversible Thing",
    "lang": "en",
    "layout": "reversible_card",
}

# Missing both type_line and card_faces.
BAD_CARD = {
    "object": "card",
    "name": "Bad Card",
    "lang": "en",
    "layout": "normal",
    "oracle_id": "oid-bad",
    "image_uris": {"normal": "https://img/bad.jpg"},
}


def _write_jsonl(path: Path, cards: list[dict]) -> None:
    path.write_text(
        "\n".join(json.dumps(card) for card in cards) + "\n", encoding="utf-8"
    )


@pytest.fixture()
def db_url(tmp_path, monkeypatch):
    """A fresh SQLite DB reached through the real TOURNAMENT_DATABASE_URL path."""
    url = f"sqlite:///{tmp_path / 'tournament.db'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    engine.dispose()
    monkeypatch.setenv("TOURNAMENT_DATABASE_URL", url)
    return url


def _seed(url: str, cards: list[tuple[str, str]]) -> None:
    engine = create_engine(url)
    session = sessionmaker(bind=engine)()
    for name, oracle_id in cards:
        session.add(Card(name=name, scryfall_oracle_id=oracle_id, is_land=False))
    session.commit()
    session.close()
    engine.dispose()


def _row(url: str, oracle_id: str) -> Card:
    engine = create_engine(url)
    session = sessionmaker(bind=engine)()
    row = session.query(Card).filter(Card.scryfall_oracle_id == oracle_id).one()
    session.expunge(row)
    session.close()
    engine.dispose()
    return row


# --- end-to-end runs ----------------------------------------------------------

def test_backfill_fills_both_rows(tmp_path, db_url, capsys):
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [BOLT, FINKS])
    _seed(db_url, [("lightning bolt", "oid-bolt"), ("kitchen finks", "oid-finks")])

    assert bcd.main(["--oracle", str(oracle)]) == 0
    out = capsys.readouterr().out
    assert re.search(r"\bmatched: 2\b", out)
    assert "updated: 2" in out
    assert "unmatched: 0" in out

    bolt = _row(db_url, "oid-bolt")
    assert bolt.display_name == "Lightning Bolt"
    assert bolt.type_line == "Instant"
    assert bolt.mana_cost == "{R}"
    assert bolt.cmc == 1.0
    assert bolt.image_normal == "https://img/bolt.jpg"
    assert bolt.image_back is None
    assert bolt.scryfall_uri == "https://scryfall.com/card/lea/161/bolt"
    assert bolt.scryfall_id == "print-bolt"

    finks = _row(db_url, "oid-finks")
    assert finks.display_name == "Kitchen Finks // Kitchen Finks"
    assert finks.type_line == "Creature — Ouphe"
    assert finks.mana_cost == "{1}{W/B}{W/B}"
    assert finks.image_normal == "https://img/finks-front.jpg"
    assert finks.image_back == "https://img/finks-back.jpg"


def test_filled_row_untouched_without_refresh_and_rewritten_with_it(
    tmp_path, db_url, capsys
):
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [BOLT])
    _seed(db_url, [("lightning bolt", "oid-bolt")])
    engine = create_engine(db_url)
    session = sessionmaker(bind=engine)()
    card = session.query(Card).one()
    card.type_line = "Instant (stale)"
    card.display_name = "stale name"
    session.commit()
    session.close()
    engine.dispose()

    assert bcd.main(["--oracle", str(oracle)]) == 0
    out = capsys.readouterr().out
    assert re.search(r"\bmatched: 0\b", out)
    assert "updated: 0" in out
    assert _row(db_url, "oid-bolt").display_name == "stale name"

    assert bcd.main(["--oracle", str(oracle), "--refresh"]) == 0
    out = capsys.readouterr().out
    assert re.search(r"\bmatched: 1\b", out)
    assert "updated: 1" in out
    refreshed = _row(db_url, "oid-bolt")
    assert refreshed.display_name == "Lightning Bolt"
    assert refreshed.type_line == "Instant"


def test_unmatched_oracle_id_reported_and_left_null(tmp_path, db_url, capsys):
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [BOLT])
    _seed(db_url, [("custom card", "oid-custom")])

    assert bcd.main(["--oracle", str(oracle)]) == 0
    out = capsys.readouterr().out
    assert re.search(r"\bmatched: 0\b", out)
    assert "updated: 0" in out
    assert "unmatched: 1" in out
    assert "custom card" in out
    row = _row(db_url, "oid-custom")
    assert row.type_line is None
    assert row.display_name is None


def test_reversible_card_without_oracle_id_is_skipped(tmp_path, db_url, capsys):
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [BOLT, REVERSIBLE])
    _seed(db_url, [("lightning bolt", "oid-bolt")])

    assert bcd.main(["--oracle", str(oracle)]) == 0
    out = capsys.readouterr().out
    assert re.search(r"\bmatched: 1\b", out)
    assert "updated: 1" in out


def test_dry_run_reports_counts_and_writes_nothing(tmp_path, db_url, capsys):
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [BOLT, FINKS])
    _seed(db_url, [("lightning bolt", "oid-bolt"), ("custom card", "oid-custom")])

    assert bcd.main(["--oracle", str(oracle), "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert re.search(r"\bmatched: 1\b", out)
    assert "updated: 1" in out
    assert "unmatched: 1" in out
    assert "dry run" in out

    bolt = _row(db_url, "oid-bolt")
    assert bolt.type_line is None
    assert bolt.display_name is None


def test_second_run_updates_zero_rows(tmp_path, db_url, capsys):
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [BOLT, FINKS])
    _seed(db_url, [("lightning bolt", "oid-bolt"), ("kitchen finks", "oid-finks")])

    assert bcd.main(["--oracle", str(oracle)]) == 0
    capsys.readouterr()

    assert bcd.main(["--oracle", str(oracle)]) == 0
    out = capsys.readouterr().out
    assert re.search(r"\bmatched: 0\b", out)
    assert "updated: 0" in out


def test_interrupted_run_leaves_first_chunk_and_rerun_fills_rest(
    tmp_path, db_url, monkeypatch, capsys
):
    oracle = tmp_path / "oracle_cards.jsonl"
    cards = [
        BOLT,
        FINKS,
        {**BOLT, "name": "Giant Growth", "oracle_id": "oid-giant",
         "id": "print-giant", "scryfall_uri": "https://scryfall.com/card/lea/170"},
    ]
    _write_jsonl(oracle, cards)
    _seed(db_url, [("lightning bolt", "oid-bolt"), ("kitchen finks", "oid-finks"),
                   ("giant growth", "oid-giant")])

    real_extract = bcd.extract_scryfall_fields
    calls = {"n": 0}

    def flaky_extract(card):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("interrupted after the first chunk")
        return real_extract(card)

    monkeypatch.setattr(bcd, "extract_scryfall_fields", flaky_extract)
    with pytest.raises(RuntimeError, match="interrupted"):
        bcd.main(["--oracle", str(oracle), "--batch-size", "1"])

    filled = {oid for oid in ("oid-bolt", "oid-finks", "oid-giant")
              if _row(db_url, oid).type_line is not None}
    assert len(filled) == 1  # exactly the first chunk committed

    assert bcd.main(["--oracle", str(oracle), "--batch-size", "1"]) == 0
    out = capsys.readouterr().out
    assert re.search(r"\bmatched: 2\b", out)  # the resume filter skips the already-filled row
    assert "updated: 2" in out
    assert all(_row(db_url, oid).type_line is not None
               for oid in ("oid-bolt", "oid-finks", "oid-giant"))


def test_preflight_failure_on_missing_type_lines_writes_nothing(
    tmp_path, db_url, capsys
):
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [BOLT, BAD_CARD])
    _seed(db_url, [("lightning bolt", "oid-bolt"), ("bad card", "oid-bad")])

    assert bcd.main(["--oracle", str(oracle)]) == 1
    captured = capsys.readouterr()
    out = captured.out + captured.err
    assert "pre-flight failed" in out
    assert "aborting without writing" in out

    for oid in ("oid-bolt", "oid-bad"):
        row = _row(db_url, oid)
        assert row.type_line is None
        assert row.display_name is None


def _summary(out: str) -> str:
    return next(line for line in out.splitlines() if line.startswith("matched:"))


def test_tolerated_bad_card_is_skipped_and_rerun_updates_zero(
    tmp_path, db_url, capsys
):
    # 100 good cards + 1 bad one is inside the 1% pre-flight tolerance.
    good = [
        {**BOLT, "name": f"Card {i}", "oracle_id": f"oid-{i}", "id": f"print-{i}"}
        for i in range(100)
    ]
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [*good, BAD_CARD])
    _seed(db_url, [(f"card {i}", f"oid-{i}") for i in range(100)]
          + [("bad card", "oid-bad")])

    assert bcd.main(["--oracle", str(oracle)]) == 0
    out = capsys.readouterr().out
    assert _summary(out) == (
        "matched: 101, updated: 100, skipped: 1, unmatched: 0"
    )
    assert "skipped: Bad Card (oid-bad)" in out
    bad = _row(db_url, "oid-bad")
    assert bad.type_line is None
    assert bad.display_name is None  # not written at all

    # The bad row is still a candidate, but alone it must not trip the
    # pre-flight, and nothing is written for it.
    assert bcd.main(["--oracle", str(oracle)]) == 0
    out = capsys.readouterr().out
    assert _summary(out) == "matched: 1, updated: 0, skipped: 1, unmatched: 0"


def test_each_chunk_is_one_batched_update(tmp_path, db_url, capsys):
    oracle = tmp_path / "oracle_cards.jsonl"
    cards = [
        {**BOLT, "name": f"Card {i}", "oracle_id": f"oid-{i}", "id": f"print-{i}"}
        for i in range(5)
    ]
    _write_jsonl(oracle, cards)
    _seed(db_url, [(f"card {i}", f"oid-{i}") for i in range(5)])

    updates = []

    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("UPDATE"):
            updates.append(len(parameters) if executemany else 1)

    event.listen(Engine, "before_cursor_execute", record)
    try:
        assert bcd.main(["--oracle", str(oracle), "--batch-size", "2"]) == 0
    finally:
        event.remove(Engine, "before_cursor_execute", record)

    assert _summary(capsys.readouterr().out) == (
        "matched: 5, updated: 5, skipped: 0, unmatched: 0"
    )
    assert updates == [2, 2, 1]  # one statement per chunk, not per row
    assert all(_row(db_url, f"oid-{i}").type_line == "Instant" for i in range(5))


def test_download_failure_reports_error_and_writes_nothing(
    db_url, monkeypatch, capsys
):
    _seed(db_url, [("lightning bolt", "oid-bolt")])

    def failing_iter_cards(path):
        raise bcd._ucc.DownloadError("HTTP 503 Service Unavailable from x")
        yield  # pragma: no cover

    monkeypatch.setattr(bcd._ucc, "iter_cards", failing_iter_cards)
    assert bcd.main([]) == 1
    err = capsys.readouterr().err
    assert "HTTP 503 Service Unavailable" in err
    assert _row(db_url, "oid-bolt").type_line is None


def test_preflight_requires_per_face_images_on_double_faced_cards(
    tmp_path, db_url, capsys
):
    half_faced = {
        **FINKS,
        "card_faces": [FINKS["card_faces"][0], {}],
    }
    oracle = tmp_path / "oracle_cards.jsonl"
    _write_jsonl(oracle, [half_faced])
    _seed(db_url, [("kitchen finks", "oid-finks")])

    assert bcd.main(["--oracle", str(oracle)]) == 1
    captured = capsys.readouterr()
    out = captured.out + captured.err
    assert "per-face images" in out
    assert _row(db_url, "oid-finks").type_line is None


# --- index_oracle_cards -------------------------------------------------------

def test_index_skips_objects_without_oracle_id(monkeypatch):
    printed_twice = {**BOLT, "set": "2XM"}
    yielded = [printed_twice, REVERSIBLE, {"object": "card", "name": "No Oracle"}]

    def fake_iter_cards(path):
        assert path is None
        yield from yielded

    monkeypatch.setattr(bcd._ucc, "iter_cards", fake_iter_cards)
    index = bcd.index_oracle_cards(None)
    assert set(index) == {"oid-bolt"}  # reversible_card and the oracle-less
    # object are skipped; the first printing wins on duplicates.
    assert index["oid-bolt"] is printed_twice


# --- required-field helpers ---------------------------------------------------

def test_required_field_problems_lists_each_missing_field():
    assert bcd.required_field_problems(BOLT) == []
    problems = bcd.required_field_problems({"name": "X"})
    assert problems == ["type_line", "image_uris"]
    assert bcd.required_field_problems(FINKS) == []


def test_face_image_problem_tolerates_top_level_images():
    assert not bcd.face_image_problem(FINKS)
    split = {"card_faces": [{}, {}], "image_uris": {"normal": "https://img/x.jpg"}}
    assert not bcd.face_image_problem(split)
    assert bcd.face_image_problem({**FINKS, "card_faces": [FINKS["card_faces"][0], {}]})