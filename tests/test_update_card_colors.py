"""scripts/update_card_colors.py: derivation rules, render, filtering, atomic write.

All Scryfall data is hand-built minimal dicts; no network access.
"""

import copy
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "update_card_colors", ROOT / "scripts" / "update_card_colors.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ucc = _load_module()


# --- Scryfall-shaped fixtures -------------------------------------------------

WHITE_CREATURE = {
    "name": "Savannah Lions Plus",
    "layout": "normal",
    "mana_cost": "{1}{W}",
    "type_line": "Creature — Cat",
    "oracle_text": "",
    "colors": ["W"],
}
KITCHEN_FINKS = {
    "name": "Kitchen Finks",
    "layout": "normal",
    "mana_cost": "{1}{G/W}{G/W}",
    "type_line": "Creature — Ouphe",
    "oracle_text": "Persist",
    "colors": ["G", "W"],
}
COLORLESS_ARTIFACT = {
    "name": "Mind Stone",
    "layout": "normal",
    "mana_cost": "{2}",
    "type_line": "Artifact",
    "oracle_text": "{T}: Add {C}.",
    "colors": [],
}
ANCESTRAL_VISION = {
    "name": "Ancestral Vision",
    "layout": "normal",
    "mana_cost": "",
    "type_line": "Sorcery",
    "oracle_text": "Suspend 4—{U}",
    "colors": ["U"],
}
FIRE_ICE = {
    "name": "Fire // Ice",
    "layout": "split",
    "type_line": "Instant // Instant",
    "colors": ["U", "R"],
    "card_faces": [
        {"name": "Fire", "mana_cost": "{1}{R}", "type_line": "Instant",
         "oracle_text": "Fire deals 2 damage divided as you choose."},
        {"name": "Ice", "mana_cost": "{1}{U}", "type_line": "Instant",
         "oracle_text": "Tap target permanent. Draw a card."},
    ],
}
BONECRUSHER = {
    "name": "Bonecrusher Giant // Stomp",
    "layout": "adventure",
    "type_line": "Creature — Giant // Instant — Adventure",
    "colors": ["R"],
    "card_faces": [
        {"name": "Bonecrusher Giant", "mana_cost": "{2}{R}",
         "type_line": "Creature — Giant", "oracle_text": ""},
        {"name": "Stomp", "mana_cost": "{1}{R}",
         "type_line": "Instant — Adventure", "oracle_text": "Stomp deals 2 damage."},
    ],
}
SHATTERSKULL = {
    "name": "Shatterskull Smashing // Shatterskull, the Hammer Pass",
    "layout": "modal_dfc",
    "type_line": "Sorcery // Land",
    "card_faces": [
        {"name": "Shatterskull Smashing", "mana_cost": "{X}{R}{R}",
         "type_line": "Sorcery", "oracle_text": "Deal X damage.", "colors": ["R"]},
        {"name": "Shatterskull, the Hammer Pass", "mana_cost": "",
         "type_line": "Land", "oracle_text": "{T}: Add {R}.", "colors": []},
    ],
}
VOLCANIC_ISLAND = {
    "name": "Volcanic Island",
    "layout": "normal",
    "mana_cost": "",
    "type_line": "Land — Island Mountain",
    "oracle_text": "({T}: Add {U} or {R}.)",
    "colors": [],
}
MANA_CONFLUENCE = {
    "name": "Mana Confluence",
    "layout": "normal",
    "mana_cost": "",
    "type_line": "Land",
    "oracle_text": "{T}, Pay 1 life: Add one mana of any color.",
    "colors": [],
}

ALL_CARDS = [
    WHITE_CREATURE, KITCHEN_FINKS, COLORLESS_ARTIFACT, ANCESTRAL_VISION,
    FIRE_ICE, BONECRUSHER, SHATTERSKULL, VOLCANIC_ISLAND, MANA_CONFLUENCE,
]


# --- derive() -----------------------------------------------------------------

@pytest.mark.parametrize(
    ("card", "lands", "nonlands"),
    [
        pytest.param(WHITE_CREATURE, {}, {"Savannah Lions Plus": "W"}, id="mono-white"),
        pytest.param(KITCHEN_FINKS, {}, {}, id="hybrid-only-excluded"),
        pytest.param(COLORLESS_ARTIFACT, {}, {}, id="colorless-excluded"),
        pytest.param(ANCESTRAL_VISION, {}, {"Ancestral Vision": "U"}, id="color-indicator"),
        pytest.param(FIRE_ICE, {}, {"Fire // Ice": "UR"}, id="split"),
        pytest.param(BONECRUSHER, {}, {"Bonecrusher Giant": "R", "Stomp": "R"}, id="adventure"),
        pytest.param(
            SHATTERSKULL,
            {"Shatterskull, the Hammer Pass": "R", "Shatterskull Smashing": "R"},
            {"Shatterskull Smashing": "R"},
            id="mdfc-land-back",
        ),
        pytest.param(VOLCANIC_ISLAND, {"Volcanic Island": "UR"}, {}, id="basic-typed-dual"),
        pytest.param(MANA_CONFLUENCE, {}, {}, id="any-color-land-excluded"),
    ],
)
def test_derive(card, lands, nonlands):
    assert ucc.derive(card) == (lands, nonlands)


@pytest.mark.parametrize("card", ALL_CARDS, ids=lambda c: c["name"])
def test_derive_does_not_mutate_input(card):
    before = copy.deepcopy(card)
    ucc.derive(card)
    assert card == before


def test_derive_face_values_win_over_card_defaults():
    card = {
        "name": "Front // Back",
        "layout": "transform",
        "type_line": "Land // Land",
        "oracle_text": "{T}: Add {G}.",
        "colors": ["G"],
        "card_faces": [
            {"name": "Front", "mana_cost": "{U}", "type_line": "Creature",
             "oracle_text": "", "colors": ["U"]},
            {"name": "Back", "mana_cost": ""},  # inherits card type_line/oracle_text
        ],
    }
    lands, nonlands = ucc.derive(card)
    assert nonlands == {"Front": "U"}
    assert lands == {"Back": "G", "Front": "G"}


def test_nonland_color_branches():
    assert ucc.nonland_color({"mana_cost": "{G}{W}{1}"}) == "WG"
    assert ucc.nonland_color({"mana_cost": "", "colors": ["G", "U"]}) == "UG"
    assert ucc.nonland_color({"colors": ["B"]}) == "B"
    assert ucc.nonland_color({}) == ""


# --- render() -----------------------------------------------------------------

def test_render_is_json_and_appends_after_existing():
    existing = {
        "Lands": [{"Name": "Zeta Land", "Color": "G"}, {"Name": "Alpha Land", "Color": "W"}],
        "NonLands": [{"Name": "Lim-Dûl's Vault", "Color": "UB"}],
    }
    new_l = [{"Name": "Brand New Land", "Color": "R"}]
    new_n = [{"Name": "Aaa Spell", "Color": "U"}, {"Name": 'Quote "Card"', "Color": "B"}]
    text = ucc.render(existing, new_l, new_n)
    parsed = json.loads(text)
    assert [e["Name"] for e in parsed["Lands"]] == ["Zeta Land", "Alpha Land", "Brand New Land"]
    assert [e["Name"] for e in parsed["NonLands"]] == [
        "Lim-Dûl's Vault", "Aaa Spell", 'Quote "Card"',
    ]
    assert "Lim-Dûl" in text  # ensure_ascii=False keeps the file's existing style
    assert text.endswith("}\n")


# --- missing_rows() (--since filtering) ---------------------------------------

def test_missing_rows_excludes_existing_and_sorts_by_release_then_name():
    derived = {"Old": "W", "Have": "U", "NewB": "B", "NewA": "R", "Undated": "G"}
    released = {"Old": "2020-01-01", "Have": "2021-01-01",
                "NewB": "2025-09-01", "NewA": "2025-09-01"}
    existing = [{"Name": "Have", "Color": "U"}]
    rows = ucc.missing_rows(derived, existing, released, None)
    assert [r["Name"] for r in rows] == ["Old", "NewA", "NewB", "Undated"]
    assert rows[1] == {"Name": "NewA", "Color": "R"}


def test_missing_rows_since_filter():
    derived = {"Old": "W", "Edge": "U", "New": "B", "Undated": "G"}
    released = {"Old": "2025-06-12", "Edge": "2025-06-13", "New": "2025-08-01"}
    rows = ucc.missing_rows(derived, [], released, "2025-06-13")
    # On/after is inclusive; undated cards sort as "9999" and are kept.
    assert [r["Name"] for r in rows] == ["Edge", "New", "Undated"]


# --- main() end to end --------------------------------------------------------

def _oracle_line(card, released_at):
    return json.dumps({"lang": "en", "set_type": "expansion", **card,
                       "released_at": released_at})


def _run_main(monkeypatch, *argv):
    monkeypatch.setattr(sys, "argv", ["update_card_colors.py", *argv])
    return ucc.main()


@pytest.fixture()
def colors_file(tmp_path):
    path = tmp_path / "card_colors.json"
    path.write_text(json.dumps({
        "Lands": [{"Name": "Volcanic Island", "Color": "UR"}],
        "NonLands": [{"Name": "Kitchen Finks", "Color": "GW"}],
    }), encoding="utf-8")
    return path


@pytest.fixture()
def oracle_file(tmp_path):
    path = tmp_path / "oracle_cards.jsonl"
    path.write_text("\n".join([
        _oracle_line(VOLCANIC_ISLAND, "1993-08-05"),
        _oracle_line(WHITE_CREATURE, "2025-09-26"),
        _oracle_line(SHATTERSKULL, "2020-09-25"),
        _oracle_line({**ANCESTRAL_VISION, "lang": "ja"}, "2006-10-06"),
    ]) + "\n", encoding="utf-8")
    return path


def test_main_write_is_atomic_and_appends(monkeypatch, colors_file, oracle_file, tmp_path):
    replaced = []
    real_replace = ucc.os.replace

    def spy_replace(src, dst):
        replaced.append((src, dst))
        assert Path(src).parent == Path(dst).parent  # same dir => atomic rename
        assert json.loads(Path(src).read_text(encoding="utf-8"))
        return real_replace(src, dst)

    monkeypatch.setattr(ucc.os, "replace", spy_replace)
    rc = _run_main(monkeypatch, "--colors", str(colors_file), "--oracle", str(oracle_file),
                   "--write")
    assert rc == 0
    assert replaced and Path(replaced[0][1]) == colors_file
    data = json.loads(colors_file.read_text(encoding="utf-8"))
    assert data["Lands"] == [
        {"Name": "Volcanic Island", "Color": "UR"},
        {"Name": "Shatterskull Smashing", "Color": "R"},
        {"Name": "Shatterskull, the Hammer Pass", "Color": "R"},
    ]
    assert data["NonLands"] == [
        {"Name": "Kitchen Finks", "Color": "GW"},
        {"Name": "Shatterskull Smashing", "Color": "R"},
        {"Name": "Savannah Lions Plus", "Color": "W"},
    ]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["card_colors.json", "oracle_cards.jsonl"]


def test_main_write_failure_leaves_original_intact(monkeypatch, colors_file, oracle_file, tmp_path):
    original = colors_file.read_text(encoding="utf-8")

    def boom(src, dst):
        raise OSError("disk full")

    monkeypatch.setattr(ucc.os, "replace", boom)
    with pytest.raises(OSError):
        _run_main(monkeypatch, "--colors", str(colors_file), "--oracle", str(oracle_file),
                  "--write")
    assert colors_file.read_text(encoding="utf-8") == original
    assert not (tmp_path / "card_colors.json.tmp").exists()


def test_main_dry_run_and_since_do_not_write(monkeypatch, colors_file, oracle_file, capsys):
    original = colors_file.read_text(encoding="utf-8")
    rc = _run_main(monkeypatch, "--colors", str(colors_file), "--oracle", str(oracle_file),
                   "--since", "2025-01-01")
    assert rc == 0
    assert colors_file.read_text(encoding="utf-8") == original
    out = capsys.readouterr().out
    assert "missing: 0 lands, 1 non-lands" in out
    assert "Savannah Lions Plus" in out
    assert "dry-run" in out


def test_default_colors_path_honours_env(monkeypatch):
    monkeypatch.setenv("CARD_COLORS_PATH", "/somewhere/card_colors.json")
    assert _load_module().DEFAULT_COLORS == "/somewhere/card_colors.json"
