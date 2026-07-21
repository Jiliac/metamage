#!/usr/bin/env python3
"""Authoritatively determine which archetype rules match a given deck.

Replicates the MTGOArchetypeParser condition evaluation so we can see the real
conflict(A,B) pair for a conflict entry, instead of guessing via card-grep.
"""

import json
import os
import re
import sqlite3
import sys
import glob


def load_rule(path):
    """Tolerant JSON load: the C# parser allows trailing commas, Python does not."""
    txt = open(path).read()
    txt = re.sub(r",(\s*[}\]])", r"\1", txt)
    return json.loads(txt)


FMT_DIR = os.path.expanduser(
    "~/Development/dev-win/Parser/MTGOFormatData/Formats/{fmt}/Archetypes"
)
DB = os.path.join(os.path.dirname(__file__), "..", "data", "tournament.db")


def deck_cards(conn, eid):
    rows = conn.execute(
        """SELECT c.name, dc.board FROM deck_cards dc
           JOIN cards c ON c.id=dc.card_id WHERE dc.entry_id=?""",
        (eid,),
    ).fetchall()
    main = _names(rows, "MAIN")
    side = _names(rows, "SIDE")
    whole = main | side
    return main, side, whole


def _names(rows, board):
    """Card names for one board, including the front face of any DFC.

    The DB stores double-faced cards under their full "Front // Back" name, but
    rule files reference them inconsistently -- Standard/UWFlash.json triggers on
    "Aang, Swift Savior" while UBDemon.json uses "Unholy Annex // Ritual Chamber".
    The C# parser matches on the front face, so index both spellings.
    """
    out = set()
    for n, b in rows:
        if b != board:
            continue
        n = n.lower()
        out.add(n)
        if " // " in n:
            out.add(n.split(" // ", 1)[0])
    return out


CONDITION_TYPES = (
    "InMainboard",
    "InSideboard",
    "OneOrMoreInMainboard",
    "OneOrMoreInMainOrSideboard",
    "InMainOrSideboard",
    "TwoOrMoreInMainOrSideboard",
    "TwoOrMoreInMainboard",
    "DoesNotContainMainboard",
    "DoesNotContainSideboard",
    "DoesNotContain",
)
_CANON_TYPE = {t.lower(): t for t in CONDITION_TYPES}


def cond_ok(cond, main, side, whole):
    # Rule files are hand-written and the casing of Type drifts (e.g.
    # "OneorMoreInMainboard" in Standard/UWMomo.json). The C# parser tolerates
    # it, so match case-insensitively rather than throwing.
    t = _CANON_TYPE.get(cond["Type"].lower(), cond["Type"])
    cards = {c.lower() for c in cond.get("Cards", [])}
    if t == "InMainboard":
        return cards <= main
    if t == "InSideboard":
        return cards <= side
    if t == "OneOrMoreInMainboard":
        return len(cards & main) >= 1
    if t == "OneOrMoreInMainOrSideboard":
        return len(cards & whole) >= 1
    if t == "InMainOrSideboard":
        return cards <= whole
    if t == "TwoOrMoreInMainOrSideboard":
        return len(cards & whole) >= 2
    if t == "TwoOrMoreInMainboard":
        return len(cards & main) >= 2
    if t == "DoesNotContainMainboard":
        return len(cards & main) == 0
    if t == "DoesNotContainSideboard":
        return len(cards & side) == 0
    if t == "DoesNotContain":
        return len(cards & whole) == 0
    raise ValueError(f"unknown condition type {t}")


def rule_matches(conds, main, side, whole):
    return all(cond_ok(c, main, side, whole) for c in conds)


def matching_archetypes(fmt, main, side, whole):
    hits = []
    for path in glob.glob(FMT_DIR.format(fmt=fmt) + "/*.json"):
        if os.path.basename(path).startswith("Archived"):
            continue
        rule = load_rule(path)
        base = rule.get("Conditions", [])
        if not rule_matches(base, main, side, whole):
            continue
        name = rule["Name"]
        # apply best-matching variant label if any variant's extra conds also hold
        for v in rule.get("Variants", []):
            if rule_matches(v.get("Conditions", []), main, side, whole):
                name = v["Name"]
                break
        hits.append((os.path.basename(path), name))
    return hits


def main_cli():
    fmt = sys.argv[1] if len(sys.argv) > 1 else "Legacy"
    handle = sys.argv[2] if len(sys.argv) > 2 else None
    conn = sqlite3.connect(DB)
    q = """SELECT te.id, p.handle FROM tournament_entries te
           JOIN players p ON p.id=te.player_id
           JOIN tournaments t ON t.id=te.tournament_id
           JOIN formats f ON f.id=t.format_id
           JOIN archetypes a ON a.id=te.archetype_id
           WHERE lower(f.name)=lower(?) AND a.name='conflict'
             AND date(t.date) BETWEEN '2026-06-10' AND '2026-07-13'"""
    args = [fmt]
    if handle:
        q += " AND p.handle=?"
        args.append(handle)
    for eid, h in conn.execute(q, args).fetchall():
        m, s, w = deck_cards(conn, eid)
        hits = matching_archetypes(fmt, m, s, w)
        labels = ", ".join(sorted({n for _, n in hits}))
        files = ", ".join(sorted({f for f, _ in hits}))
        print(f"{h:16s} -> [{len(hits)}] {labels}   ({files})")


if __name__ == "__main__":
    main_cli()
