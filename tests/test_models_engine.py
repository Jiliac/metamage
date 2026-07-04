"""Tests for the tournament model layer's dual-mode (SQLite/Postgres) engine.

The live-Postgres tests run only when TEST_PG_URL is set (a throwaway local
Postgres); otherwise they are skipped so the suite stays runnable anywhere.
"""

import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from models import base  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for var in (
        "TOURNAMENT_DATABASE_URL",
        "TOURNAMENT_DATABASE_WRITE_URL",
        "TOURNAMENT_DB_PATH",
    ):
        monkeypatch.delenv(var, raising=False)
    yield


def test_sqlite_default_url():
    url = base._build_database_url()
    assert url.startswith("sqlite:///")
    assert url.endswith("tournament.db")


def test_tournament_db_path_respected(monkeypatch, tmp_path):
    custom = tmp_path / "custom.db"
    monkeypatch.setenv("TOURNAMENT_DB_PATH", str(custom))
    url = base._build_database_url()
    assert url.startswith("sqlite:///")
    assert str(custom) in url


def test_postgres_url_passthrough(monkeypatch):
    monkeypatch.setenv(
        "TOURNAMENT_DATABASE_URL", "postgresql://u:p@host:5432/db?sslmode=require"
    )
    url = base._build_database_url()
    assert url == "postgresql://u:p@host:5432/db?sslmode=require"
    assert base._is_postgres(url)


def test_postgres_scheme_normalized(monkeypatch):
    monkeypatch.setenv("TOURNAMENT_DATABASE_URL", "postgres://u:p@host:5432/db")
    url = base._build_database_url()
    assert url.startswith("postgresql://")
    assert not url.startswith("postgres://u")


def test_empty_url_falls_back_to_sqlite(monkeypatch):
    monkeypatch.setenv("TOURNAMENT_DATABASE_URL", "")
    url = base._build_database_url()
    assert url.startswith("sqlite:///")


def test_sqlite_engine_has_pragma_and_dialect():
    engine = base.get_engine()
    assert engine.dialect.name == "sqlite"
    # SQLite pragma listener should make a connection usable without error.
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1


def test_alias_write_engine_uses_write_url(monkeypatch):
    monkeypatch.setenv(
        "TOURNAMENT_DATABASE_WRITE_URL", "postgresql://w:p@host:5432/db"
    )
    # Build URL logic is exercised without connecting: dialect is postgres.
    engine = base.get_alias_write_engine()
    assert engine.dialect.name == "postgresql"


@pytest.mark.skipif(
    not os.getenv("TEST_PG_URL"), reason="TEST_PG_URL not set (no local Postgres)"
)
def test_postgres_engine_connects_without_pragma(monkeypatch):
    monkeypatch.setenv("TOURNAMENT_DATABASE_URL", os.environ["TEST_PG_URL"])
    engine = base.get_engine()
    assert engine.dialect.name == "postgresql"
    # No PRAGMA listener should fire on Postgres — this connect would error if it did.
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1
