#!/usr/bin/env python3
"""Append missing cards to MTGOFormatData's ``Formats/card_colors.json``.

The C# parser (MTGOArchetypeParser.ArchetypeAnalyzer.GetColors) names a deck
"<color> <archetype>" using only cards it finds in card_colors.json: a color is
kept when it appears in BOTH a known land and a known non-land. Cards missing
from that file are silently ignored, so every set that is not in the file makes
color detection drift (e.g. "golgari sacrifice" / "rakdos sacrifice" for a deck
whose only red/green spells are post-June-2025 cards).

Upstream (Badaro/MTGOFormatData) stopped updating the file in June 2025 (FIN).
This script reproduces the file's conventions from Scryfall oracle data and
appends whatever is missing. Existing entries are never modified.

Conventions reverse-engineered from the existing file (validated with
``--validate``):

* NonLands: color = plain {W}{U}{B}{R}{G} symbols in the face's mana cost;
  hybrid-only costs (Kitchen Finks) and colorless cards are excluded; a face
  with no mana cost uses its color indicator (Ancestral Vision).
* Lands: color = basic land subtypes on the type line + colored mana symbols
  in the rules text. "Any color" lands (Cavern of Souls, Mana Confluence) and
  fetches are excluded.
* Multi-face cards are keyed by the FRONT face name, which is how MTGO
  decklists (and MTGODecklistCache) list them. Split cards use the full
  "A // B" name. A modal DFC with a land face also gets a Lands entry under the
  front name (Shatterskull Smashing -> R in both lists).

Usage:
  python scripts/update_card_colors.py --validate          # rule agreement vs existing file
  python scripts/update_card_colors.py                     # dry-run: what would be added
  python scripts/update_card_colors.py --write             # append missing cards
  python scripts/update_card_colors.py --oracle oracle_cards.jsonl --write
  CARD_COLORS_PATH=/path/to/card_colors.json python scripts/update_card_colors.py

Without --oracle the Scryfall "oracle_cards" bulk file is downloaded (~200 MB).
--colors defaults to $CARD_COLORS_PATH, else
~/Development/mtg/Parser/MTGOFormatData/Formats/card_colors.json.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import re
import sys
import urllib.request
from collections import Counter, OrderedDict

DEFAULT_COLORS = os.environ.get(
    "CARD_COLORS_PATH",
    os.path.expanduser("~/Development/mtg/Parser/MTGOFormatData/Formats/card_colors.json"),
)
WUBRG = "WUBRG"
BASIC_TYPES = {"Plains": "W", "Island": "U", "Swamp": "B", "Mountain": "R", "Forest": "G"}
SYMBOL_RE = re.compile(r"\{([WUBRG])\}")
SKIP_LAYOUTS = {
    "token", "double_faced_token", "emblem", "art_series", "augment", "host",
    "scheme", "vanguard", "planar", "reversible_card",
}
SKIP_SET_TYPES = {"memorabilia", "token", "minigame", "alchemy"}
UA = {"User-Agent": "metamage-card-colors/1.0", "Accept": "application/json"}


def order(colors: set[str]) -> str:
    return "".join(c for c in WUBRG if c in colors)


def is_land(face: dict) -> bool:
    return "Land" in face.get("type_line", "")


def nonland_color(face: dict) -> str:
    cost = face.get("mana_cost")
    if cost:
        return order(set(SYMBOL_RE.findall(cost)))
    # No mana cost (Ancestral Vision): fall back to the color indicator.
    return order(set(face.get("colors") or []))


def land_color(face: dict) -> str:
    colors = set(SYMBOL_RE.findall(face.get("oracle_text", "")))
    for word in re.split(r"[\s—-]+", face.get("type_line", "")):
        if word in BASIC_TYPES:
            colors.add(BASIC_TYPES[word])
    return order(colors)


def derive(card: dict) -> tuple[dict[str, str], dict[str, str]]:
    """Return ({name: color} for Lands, {name: color} for NonLands) for one card."""
    lands: dict[str, str] = {}
    nonlands: dict[str, str] = {}
    layout = card.get("layout", "normal")
    # Single-face cards carry mana_cost/colors/type_line at top level; faces
    # of split/adventure cards carry their own. Fill gaps from the card level
    # (face values win) into new dicts so the input card is never mutated.
    defaults = {
        "type_line": card.get("type_line", ""),
        "oracle_text": card.get("oracle_text", ""),
        **({"colors": card["colors"]} if "colors" in card else {}),
    }
    faces = [{**defaults, **f} for f in card.get("card_faces") or [card]]

    if layout == "split":
        color = order(set(SYMBOL_RE.findall("".join(f.get("mana_cost", "") for f in faces))))
        if color:
            nonlands[card["name"]] = color
        return lands, nonlands

    front = faces[0]
    land_faces = [f for f in faces if is_land(f)]
    land_union = order(set("".join(land_color(f) for f in land_faces)))
    # The existing file also keys transform back faces (Howlpack Alpha) by
    # their own name; MTGO lists the front, so these are only for completeness.
    for f in faces:
        if not is_land(f):
            color = nonland_color(f)
            if color:
                nonlands[f["name"]] = color
    if land_union:
        for f in land_faces:
            lands[f["name"]] = land_union
        lands.setdefault(front["name"], land_union)
    return lands, nonlands


def iter_cards(path: str | None):
    if path is None:
        meta = json.load(urllib.request.urlopen(urllib.request.Request(
            "https://api.scryfall.com/bulk-data", headers=UA)))
        uri = next(x for x in meta["data"] if x["type"] == "oracle_cards")["jsonl_download_uri"]
        print(f"downloading {uri}", file=sys.stderr)
        raw = urllib.request.urlopen(urllib.request.Request(uri, headers=UA)).read()
        fh = io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(raw)), encoding="utf-8")
    elif path.endswith(".gz"):
        fh = io.TextIOWrapper(gzip.open(path), encoding="utf-8")
    else:
        fh = open(path, encoding="utf-8")
    with fh:
        first = fh.read(64).lstrip()[:1]
        fh.seek(0)
        if first == "[":
            yield from json.load(fh)
        else:
            for line in fh:
                line = line.strip()
                if line:
                    yield json.loads(line)


def wanted(card: dict) -> bool:
    if card.get("lang", "en") != "en":
        return False
    if card.get("layout") in SKIP_LAYOUTS or card.get("set_type") in SKIP_SET_TYPES:
        return False
    if card["name"].startswith("A-"):  # Arena rebalanced
        return False
    return True


def build(oracle_path: str | None) -> tuple[dict, dict, dict]:
    lands: dict[str, str] = {}
    nonlands: dict[str, str] = {}
    released: dict[str, str] = {}
    for card in iter_cards(oracle_path):
        if not wanted(card):
            continue
        card_lands, card_nonlands = derive(card)
        for name, color in card_lands.items():
            lands.setdefault(name, color)
            released.setdefault(name, card.get("released_at", "9999"))
        for name, color in card_nonlands.items():
            nonlands.setdefault(name, color)
            released.setdefault(name, card.get("released_at", "9999"))
    return lands, nonlands, released


def validate(existing: dict, lands: dict, nonlands: dict) -> None:
    for key, derived in (("Lands", lands), ("NonLands", nonlands)):
        cur = {e["Name"]: e["Color"] for e in existing[key]}
        agree = Counter()
        diffs = []
        for name, color in cur.items():
            got = derived.get(name)
            if got is None:
                agree["not derived"] += 1
                diffs.append((name, color, "-"))
            elif got == color:
                agree["match"] += 1
            else:
                agree["differ"] += 1
                diffs.append((name, color, got))
        total = sum(agree.values())
        print(f"{key}: {total} existing, match {agree['match']} "
              f"({100*agree['match']/total:.1f}%), differ {agree['differ']}, "
              f"not derived {agree['not derived']}")
        for name, color, got in diffs[:25]:
            print(f"   {name:50s} file={color:6s} rule={got}")
        extra = [n for n in derived if n not in cur]
        print(f"   would add {len(extra)} {key}")


def render(existing: dict, new_lands: list, new_nonlands: list) -> str:
    def block(entries):
        return ",\n".join(
            f'      {{ "Name": {json.dumps(e["Name"], ensure_ascii=False)}, "Color": "{e["Color"]}" }}'
            for e in entries
        )
    return (
        "{\n"
        '   "Lands":\n   [\n' + block(existing["Lands"] + new_lands) + "\n   ],\n"
        '   "NonLands":\n   [\n' + block(existing["NonLands"] + new_nonlands) + "\n   ]\n"
        "}\n"
    )


def missing_rows(derived: dict, existing_rows: list, released: dict,
                 since: str | None) -> list[dict]:
    """Derived cards absent from ``existing_rows``, optionally released on/after
    ``since``, ordered by (release date, name)."""
    have = {e["Name"] for e in existing_rows}
    rows = [
        {"Name": n, "Color": c} for n, c in derived.items()
        if n not in have and (since is None or released.get(n, "9999") >= since)
    ]
    return sorted(rows, key=lambda e: (released.get(e["Name"], "9999"), e["Name"]))


def print_summary(new_l: list, new_n: list, released: dict) -> None:
    print(f"missing: {len(new_l)} lands, {len(new_n)} non-lands")
    by_year = Counter(released.get(e["Name"], "?")[:4] for e in new_l + new_n)
    print("by release year:", dict(sorted(by_year.items())))
    for e in (new_l + new_n)[-15:]:
        print(f"   {released.get(e['Name'])}  {e['Name']:50s} {e['Color']}")


def write_atomic(path: str, text: str) -> None:
    """Write via a sibling temp file + os.replace so a crash never leaves a
    truncated card_colors.json behind."""
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--colors", default=DEFAULT_COLORS, help="path to card_colors.json")
    ap.add_argument("--oracle", help="Scryfall oracle_cards .json/.jsonl[.gz]; downloaded if omitted")
    ap.add_argument("--validate", action="store_true", help="compare rules against existing entries only")
    ap.add_argument("--write", action="store_true", help="append missing cards (default is dry-run)")
    ap.add_argument("--since", default=None, help="only add cards released on/after YYYY-MM-DD")
    args = ap.parse_args()

    with open(args.colors, encoding="utf-8") as fh:
        existing = json.load(fh, object_pairs_hook=OrderedDict)
    lands, nonlands, released = build(args.oracle)

    if args.validate:
        validate(existing, lands, nonlands)
        return 0

    new_l = missing_rows(lands, existing["Lands"], released, args.since)
    new_n = missing_rows(nonlands, existing["NonLands"], released, args.since)
    print_summary(new_l, new_n, released)

    if not args.write:
        print("dry-run; pass --write to update", args.colors)
        return 0
    text = render(existing, new_l, new_n)
    json.loads(text)  # must stay valid JSON for the C# loader
    write_atomic(args.colors, text)
    print(f"wrote {args.colors}: {len(existing['Lands'])+len(new_l)} lands, "
          f"{len(existing['NonLands'])+len(new_n)} non-lands")
    return 0


if __name__ == "__main__":
    sys.exit(main())
