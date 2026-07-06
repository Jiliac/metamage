"""MCP read-only enforcement across dialects.

apply_read_only attaches a dialect-aware guard: PRAGMA query_only on SQLite,
default_transaction_read_only on Postgres (defense-in-depth on top of the
SELECT-only role). validate_select_only is dialect-agnostic and unchanged.
"""

import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError, InternalError, ProgrammingError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.mcp_server.utils import apply_read_only, validate_select_only  # noqa: E402


def test_validate_select_only_accepts_select():
    assert validate_select_only("SELECT 1") == "SELECT 1"
    assert validate_select_only("WITH x AS (SELECT 1) SELECT * FROM x;").startswith(
        "WITH"
    )


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO t VALUES (1)",
        "UPDATE t SET a=1",
        "DELETE FROM t",
        "DROP TABLE t",
        "SELECT 1; SELECT 2",
        "PRAGMA query_only=OFF",
    ],
)
def test_validate_select_only_rejects_writes_and_multistatement(sql):
    with pytest.raises(ValueError):
        validate_select_only(sql)


def test_sqlite_read_engine_blocks_writes():
    engine = apply_read_only(create_engine("sqlite://"))
    # A CREATE/INSERT through the read engine must be refused by query_only.
    with pytest.raises((OperationalError,)):
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE t (a INTEGER)"))
    # SELECT still works.
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1


def test_session_on_guarded_engine_blocks_writes():
    # A session bound to a guarded engine must inherit the read-only guard.
    engine = apply_read_only(create_engine("sqlite://"))
    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        with pytest.raises(OperationalError):
            s.execute(text("CREATE TABLE probe (a INTEGER)"))
            s.commit()
    finally:
        s.close()


def test_module_session_factory_bound_to_guarded_engine():
    # Regression: get_session() must use the SAME guarded engine, not a fresh
    # unguarded one built by get_session_factory().
    from src.mcp_server import utils

    assert utils.session_factory.kw["bind"] is utils.engine


@pytest.mark.skipif(
    not os.getenv("TEST_PG_URL"), reason="TEST_PG_URL not set (no local Postgres)"
)
def test_postgres_read_engine_blocks_writes():
    engine = apply_read_only(create_engine(os.environ["TEST_PG_URL"]))
    # SELECT works and no PRAGMA error fired on connect.
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1
    # A write is refused by default_transaction_read_only.
    with pytest.raises((InternalError, ProgrammingError, OperationalError)):
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE ro_probe (a int)"))
