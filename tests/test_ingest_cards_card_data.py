"""R14/KTD3: get_or_create_card fills the KTD1 columns for new cards only."""

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from models import Card  # noqa: E402
from ingest import ingest_cards as ic  # noqa: E402

NAMED_RESPONSE = {
    "name": "Lightning Bolt",
    "layout": "normal",
    "type_line": "Instant",
    "mana_cost": "{R}",
    "cmc": 1.0,
    "colors": ["R"],
    "oracle_id": "oracle-uuid",
    "image_uris": {"normal": "https://cards.scryfall.io/normal/front/b/b/bb.jpg"},
    "scryfall_uri": "https://scryfall.com/card/lea/161/lightning-bolt",
    "id": "print-uuid",
}


class _FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


@pytest.fixture()
def session():
    engine = create_engine("sqlite://")
    from models import Base

    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_get_or_create_card_fills_scryfall_fields(session, monkeypatch):
    calls = []

    def fake_get(url, params, context):
        calls.append(url)
        if "cards/named" in url:
            return _FakeResponse(200, dict(NAMED_RESPONSE))
        # Printings lookup: 404 short-circuits to None, no set enrichment.
        return _FakeResponse(404)

    monkeypatch.setattr(ic, "_scryfall_get", fake_get)

    card, is_new = ic.get_or_create_card(session, ic.CardCache(), "Lightning Bolt")

    assert is_new is True
    assert [c for c in calls if "cards/named" in c], "named lookup happened"
    assert card.display_name == "Lightning Bolt"
    assert card.type_line == "Instant"
    assert card.mana_cost == "{R}"
    assert card.cmc == 1.0
    assert card.image_normal == "https://cards.scryfall.io/normal/front/b/b/bb.jpg"
    assert card.image_back is None
    assert card.scryfall_uri == "https://scryfall.com/card/lea/161/lightning-bolt"
    assert card.scryfall_id == "print-uuid"
    # Pre-existing behaviour is untouched. CaseInsensitiveText lowercases on
    # write only, so the in-memory object still holds the proper-case name.
    assert card.is_land is False
    assert card.colors == "R"

    session.expire_all()
    stored = session.query(Card).one()
    assert stored.display_name == "Lightning Bolt"
    assert stored.name == "lightning bolt"  # CaseInsensitiveText lowercases
    assert stored.scryfall_id == "print-uuid"


def test_get_or_create_card_known_card_makes_no_call(session, monkeypatch):
    session.add(
        Card(id="c1", name="lightning bolt", scryfall_oracle_id="oracle-uuid",
             is_land=False)
    )
    session.commit()

    def fail_get(url, params, context):  # pragma: no cover - must not run
        raise AssertionError(f"unexpected Scryfall call: {url}")

    monkeypatch.setattr(ic, "_scryfall_get", fail_get)

    card, is_new = ic.get_or_create_card(session, ic.CardCache(), "Lightning Bolt")

    assert is_new is False
    assert card.id == "c1"
    # The row is left unchanged: backfilling existing cards is U2's job.
    assert card.display_name is None
    assert card.scryfall_id is None


def test_request_delay_honors_scryfall_limit():
    # KTD3: 0.5s keeps /cards/named at or below the ~2 req/s cap.
    assert ic.SCRYFALL_REQUEST_DELAY == 0.5