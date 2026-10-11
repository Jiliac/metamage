"""KTD2: the pure Scryfall -> cards-column field extractor."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ingest.scryfall_fields import extract_scryfall_fields  # noqa: E402


def test_normal_card():
    data = {
        "name": "Lightning Bolt",
        "layout": "normal",
        "type_line": "Instant",
        "mana_cost": "{R}",
        "cmc": 1.0,
        "image_uris": {
            "normal": "https://cards.scryfall.io/normal/front/b/b/bb.jpg",
        },
        "scryfall_uri": "https://scryfall.com/card/lea/161/lightning-bolt",
        "id": "print-uuid",
    }
    fields = extract_scryfall_fields(data)
    assert fields == {
        "display_name": "Lightning Bolt",
        "type_line": "Instant",
        "mana_cost": "{R}",
        "cmc": 1.0,
        "image_normal": "https://cards.scryfall.io/normal/front/b/b/bb.jpg",
        "image_back": None,
        "scryfall_uri": "https://scryfall.com/card/lea/161/lightning-bolt",
        "scryfall_id": "print-uuid",
    }


def test_transform_card_uses_faces():
    # Transform / MDFC / battle: no top-level image_uris; front and back faces
    # each carry their own images.
    data = {
        "name": "Delver of Secrets // Insectile Aberration",
        "layout": "transform",
        "cmc": 1.0,
        "card_faces": [
            {
                "name": "Delver of Secrets",
                "type_line": "Creature — Human Wizard",
                "mana_cost": "{U}",
                "image_uris": {"normal": "https://img/front.jpg"},
            },
            {
                "name": "Insectile Aberration",
                "type_line": "Creature — Human Insect",
                "mana_cost": "",
                "image_uris": {"normal": "https://img/back.jpg"},
            },
        ],
        "scryfall_uri": "https://scryfall.com/card/vow/1/delver",
        "id": "print-uuid",
    }
    fields = extract_scryfall_fields(data)
    assert fields["display_name"] == "Delver of Secrets // Insectile Aberration"
    assert fields["type_line"] == "Creature — Human Wizard"
    assert fields["mana_cost"] == "{U}"
    assert fields["cmc"] == 1.0
    assert fields["image_normal"] == "https://img/front.jpg"
    assert fields["image_back"] == "https://img/back.jpg"


def test_split_card_keeps_full_top_level_cost():
    data = {
        "name": "Fire // Ice",
        "layout": "split",
        "type_line": "Instant",
        "mana_cost": "{R} // {2}{R}",
        "cmc": 3.0,
        "image_uris": {"normal": "https://img/split.jpg"},
        "card_faces": [
            {
                "name": "Fire",
                "type_line": "Instant",
                "mana_cost": "{R}",
                "image_uris": {"normal": "https://img/fire.jpg"},
            },
            {
                "name": "Ice",
                "type_line": "Instant",
                "mana_cost": "{2}{R}",
                "image_uris": {"normal": "https://img/ice.jpg"},
            },
        ],
        "scryfall_uri": "https://scryfall.com/card/cmd/1/fire-ice",
        "id": "print-uuid",
    }
    fields = extract_scryfall_fields(data)
    assert fields["mana_cost"] == "{R} // {2}{R}"
    assert fields["type_line"] == "Instant"  # front-face type
    assert fields["cmc"] == 3.0  # split cmc is the total
    assert fields["image_normal"] == "https://img/split.jpg"  # top-level image
    assert fields["image_back"] is None


def test_adventure_card_uses_top_level_image_and_front_type():
    # Adventure: top-level image_uris AND card_faces both exist. The image
    # comes from the top level, the type line and mana cost from the creature
    # front face.
    data = {
        "name": "Brazen Borrower // Petty Theft",
        "layout": "adventure",
        "type_line": "Creature — Faerie Rogue",
        "mana_cost": "{1}{U}",
        "cmc": 2.0,
        "image_uris": {"normal": "https://img/adventure.jpg"},
        "card_faces": [
            {
                "name": "Brazen Borrower",
                "type_line": "Creature — Faerie Rogue",
                "mana_cost": "{1}{U}",
            },
            {
                "name": "Petty Theft",
                "type_line": "Instant — Adventure",
                "mana_cost": "{2}{U}",
            },
        ],
        "scryfall_uri": "https://scryfall.com/card/eld/39/brazen-borrower",
        "id": "print-uuid",
    }
    fields = extract_scryfall_fields(data)
    assert fields["image_normal"] == "https://img/adventure.jpg"
    assert fields["image_back"] is None
    assert fields["type_line"] == "Creature — Faerie Rogue"
    assert fields["mana_cost"] == "{1}{U}"


def test_missing_optional_fields_yield_nulls():
    fields = extract_scryfall_fields({"name": "Mystery Card"})
    assert fields == {
        "display_name": "Mystery Card",
        "type_line": None,
        "mana_cost": None,
        "cmc": None,
        "image_normal": None,
        "image_back": None,
        "scryfall_uri": None,
        "scryfall_id": None,
    }
    # Even a bare dict must not raise.
    assert extract_scryfall_fields({})["display_name"] is None