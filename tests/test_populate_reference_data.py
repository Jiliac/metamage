"""Reference-data loader: CSV parsing, write-engine resolution, end-to-end runs."""

import logging
import sys
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import ingest.populate_reference_data as prd  # noqa: E402
from ingest.populate_reference_data import (  # noqa: E402
    ETERNAL_FORMATS,
    ROTATING_FORMATS,
    describe_target,
    extract_formats_from_bans,
    format_slug,
    formats_for_set,
    parse_date,
)
from models import Base  # noqa: E402
from models.base import get_write_engine  # noqa: E402


def test_format_slug_matches_db_names():
    assert format_slug("Modern") == "modern"
    assert format_slug("Duel Commander") == "duel-commander"
    assert format_slug("  duel   commander ") == "duel-commander"


def test_eternal_set_skips_rotating_formats():
    row = {"eternal_set": "TRUE", "standard_rotation": "FALSE"}
    assert formats_for_set(row) == ETERNAL_FORMATS
    assert "duel-commander" in formats_for_set(row)


def test_standard_set_hits_every_format():
    row = {"eternal_set": "FALSE", "standard_rotation": "FALSE"}
    assert formats_for_set(row) == ETERNAL_FORMATS + ROTATING_FORMATS


def test_formats_column_scopes_the_set():
    row = {"eternal_set": "TRUE", "standard_rotation": "FALSE", "formats": "Pauper"}
    assert formats_for_set(row) == ["pauper"]
    row["formats"] = "Pauper; Duel Commander"
    assert formats_for_set(row) == ["pauper", "duel-commander"]


# --- write-engine resolution -------------------------------------------------


def test_write_url_wins_over_read_url(monkeypatch, tmp_path):
    monkeypatch.setenv("TOURNAMENT_DATABASE_URL", f"sqlite:///{tmp_path / 'read.db'}")
    monkeypatch.setenv("TOURNAMENT_DATABASE_WRITE_URL", "postgres://w:secret@host/db")
    engine = get_write_engine()
    assert engine.dialect.name == "postgresql"  # scheme normalized, no connect
    assert engine.url.host == "host"
    assert describe_target(engine) == "postgresql host/db"  # password never shown


def test_postgres_without_write_url_warns(monkeypatch, caplog):
    monkeypatch.setenv("TOURNAMENT_DATABASE_URL", "postgresql://r:p@host/db")
    monkeypatch.delenv("TOURNAMENT_DATABASE_WRITE_URL", raising=False)
    with caplog.at_level(logging.WARNING, logger="models.base"):
        engine = get_write_engine()
    assert engine.url.username == "r"
    assert "TOURNAMENT_DATABASE_WRITE_URL is not set" in caplog.text


# --- main() end to end against a scratch SQLite DB ---------------------------

BANS_CSV = (
    "date,format,notes\n"
    '2024-08-26,Modern,"Nadu, Winged Wisdom BANNED, Grief BANNED"\n'
    '2024-06-17,Duel Commander,"Nadu, Winged Wisdom BANNED AS COMMANDER"\n'
)
SETS_CSV = (
    "set_name,set_code,release_date,standard_rotation,eternal_set,formats\n"
    "Duskmourn: House of Horror,DSK,2024-09-27,FALSE,FALSE,\n"
    "The Zeta Set,SLZ,2026-09-07,FALSE,TRUE,Pauper\n"
)
ALL_FORMATS = ETERNAL_FORMATS + ROTATING_FORMATS
# 2 ban rows + DSK in every format + SLZ in Pauper only.
EXPECTED_CHANGES = 2 + len(ALL_FORMATS) + 1


def _write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def test_csv_fields_tolerate_bom_and_whitespace(tmp_path):
    bans_file = tmp_path / "bans.csv"
    bans_file.write_text(BANS_CSV, encoding="utf-8-sig")
    assert extract_formats_from_bans(bans_file) == {"modern", "duel-commander"}
    row = {"eternal_set": " TRUE ", "standard_rotation": "FALSE"}
    assert formats_for_set(row) == ETERNAL_FORMATS
    assert parse_date(" 2024-09-27 ") == datetime(2024, 9, 27)


@pytest.fixture
def loader(monkeypatch, tmp_path):
    """Run main() against tmp_path CSVs; writes go to write.db, never read.db."""
    write_db = tmp_path / "write.db"
    read_db = tmp_path / "read.db"
    monkeypatch.setenv("TOURNAMENT_DATABASE_URL", f"sqlite:///{read_db}")
    monkeypatch.setenv("TOURNAMENT_DATABASE_WRITE_URL", f"sqlite:///{write_db}")
    # load_dotenv() doesn't override set vars, but would still leak the main
    # checkout's other .env keys into this process.
    monkeypatch.setattr(prd, "load_dotenv", lambda *a, **k: False)
    bans_file = _write(tmp_path / "bans.csv", BANS_CSV)
    sets_file = _write(tmp_path / "sets.csv", SETS_CSV)

    def run(*flags: str, sets: str = SETS_CSV) -> None:
        _write(sets_file, sets)
        argv = ["populate_reference_data.py", "--bans-file", str(bans_file)]
        argv += ["--sets-file", str(sets_file), *flags]
        monkeypatch.setattr(sys, "argv", argv)
        prd.main()

    run.write_db = write_db
    run.read_db = read_db
    return run


def _counts(db: Path) -> dict[str, int]:
    engine = create_engine(f"sqlite:///{db}")
    try:
        with engine.connect() as conn:
            return {
                table: conn.execute(text(f"SELECT count(*) FROM {table}")).scalar()
                for table in ("formats", "meta_changes")
            }
    finally:
        engine.dispose()


def _tables(db: Path) -> list[str]:
    engine = create_engine(f"sqlite:///{db}")
    try:
        return inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_dry_run_on_empty_db_creates_no_tables(loader):
    with pytest.raises(SystemExit) as exc:
        loader("--dry-run")
    assert exc.value.code == 1
    assert _tables(loader.write_db) == []


def test_dry_run_writes_no_rows(loader, capsys):
    engine = create_engine(f"sqlite:///{loader.write_db}")
    Base.metadata.create_all(engine)
    engine.dispose()

    loader("--dry-run")

    out = capsys.readouterr().out
    assert "➕ Added format" in out  # reported ...
    assert "rolled back" in out
    assert _counts(loader.write_db) == {
        "formats": 0,
        "meta_changes": 0,
    }  # ... not written


def test_rerun_is_idempotent_and_targets_write_url(loader, capsys):
    loader()
    first = _counts(loader.write_db)
    assert first == {"formats": len(ALL_FORMATS), "meta_changes": EXPECTED_CHANGES}
    assert not loader.read_db.exists()

    capsys.readouterr()
    loader()
    out = capsys.readouterr().out
    assert _counts(loader.write_db) == first
    assert "➕" not in out
    assert f"sqlite {loader.write_db}" in out


def test_unknown_format_in_sets_csv_raises_and_writes_nothing(loader):
    bad = SETS_CSV + "Typo Set,TYP,2026-09-07,FALSE,TRUE,Paupr\n"
    with pytest.raises(ValueError, match="paupr"):
        loader(sets=bad)
    assert _counts(loader.write_db) == {"formats": 0, "meta_changes": 0}


def test_missing_csv_exits_nonzero(loader, tmp_path, monkeypatch):
    argv = ["x", "--bans-file", str(tmp_path / "nope.csv")]
    monkeypatch.setattr(sys, "argv", argv)
    with pytest.raises(SystemExit) as exc:
        prd.main()
    assert exc.value.code == 1
