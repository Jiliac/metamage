"""alembic 9c1f4a7b2e30 (card scryfall display fields) on SQLite.

The migration must never rebuild ``cards``: under ``PRAGMA foreign_keys=ON``
(set by models.base for every SQLite connection) a rebuild's DROP TABLE
cascades into ``card_colors`` and is blocked by ``deck_cards``. The full
migration history does not apply from empty, so the DB is bootstrapped with
create_all + ``alembic stamp head``, as in production.
"""

import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from models import Base, Card, CardColor  # noqa: E402

REVISION = "9c1f4a7b2e30"
DOWN_REVISION = "ce8d1497fd5a"
DISPLAY_COLUMNS = {
    "display_name",
    "type_line",
    "mana_cost",
    "cmc",
    "image_normal",
    "image_back",
    "scryfall_uri",
    "scryfall_id",
}


@pytest.fixture()
def db_url(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'tournament.db'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    card = Card(name="lightning bolt", scryfall_oracle_id="oid-bolt", is_land=False)
    session.add(card)
    session.flush()
    session.add(CardColor(card_id=card.id, color="R"))
    session.commit()
    session.close()
    engine.dispose()
    # alembic/env.py resolves the target through TOURNAMENT_DATABASE_URL and
    # builds the engine with models.base, which turns foreign keys on.
    monkeypatch.setenv("TOURNAMENT_DATABASE_URL", url)
    return url


def _alembic_config() -> Config:
    # No ini file: env.py would otherwise run fileConfig and reset pytest's
    # loggers.
    cfg = Config()
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    return cfg


def _state(url: str) -> tuple[set[str], int, int]:
    engine = create_engine(url)
    try:
        columns = {c["name"] for c in inspect(engine).get_columns("cards")}
        with engine.connect() as conn:
            cards = conn.execute(text("SELECT COUNT(*) FROM cards")).scalar()
            colors = conn.execute(text("SELECT COUNT(*) FROM card_colors")).scalar()
    finally:
        engine.dispose()
    return columns, cards, colors


def test_downgrade_and_upgrade_keep_card_colors(db_url):
    cfg = _alembic_config()
    command.stamp(cfg, REVISION)

    command.downgrade(cfg, DOWN_REVISION)
    columns, cards, colors = _state(db_url)
    assert not DISPLAY_COLUMNS & columns
    assert (cards, colors) == (1, 1)  # no rebuild, so no cascade

    command.upgrade(cfg, REVISION)
    columns, cards, colors = _state(db_url)
    assert DISPLAY_COLUMNS <= columns
    assert (cards, colors) == (1, 1)
