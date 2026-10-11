#!/usr/bin/env python3
"""Backfill the KTD1 Scryfall display columns on ``cards`` from one bulk file.

Reads Scryfall's ``oracle_cards`` bulk file -- downloaded from
``data.scryfall.io`` when ``--oracle`` is omitted, or read from a local
``.json``/``.jsonl``/``.jsonl.gz`` path -- indexes it by ``oracle_id``, and
fills ``display_name``, ``type_line``, ``mana_cost``, ``cmc``,
``image_normal``, ``image_back``, ``scryfall_uri`` and ``scryfall_id`` on
every matching ``cards`` row. No per-card API calls.

A pre-flight check (KTD3) runs before any write over every ``cards`` row the
bulk file matches, not only the rows this run would write: the required
fields must be present on at least 99% of them and every double-faced card
must carry per-face images, otherwise the run aborts without writing. Cards
inside the 1% tolerance are skipped (left null) and reported as skipped.

By default only rows whose ``type_line`` is null are written, so an
interrupted run resumes where it stopped; ``--refresh`` rewrites every
matched row. Targets the database chosen by the existing
``TOURNAMENT_DATABASE_URL`` resolution (empty/unset = SQLite
``data/tournament.db``).
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from itertools import batched
from pathlib import Path

# Ensure we can import from src/
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ingest.scryfall_fields import extract_scryfall_fields  # noqa: E402
from models import get_session_factory  # noqa: E402
from models.reference import Card  # noqa: E402
from sqlalchemy import update  # noqa: E402

# scripts/update_card_colors.py owns the bulk-file reading: download or local
# file, JSON array or JSONL, plain or gzipped.
_ucc_spec = importlib.util.spec_from_file_location(
    "update_card_colors_for_backfill",
    Path(__file__).resolve().with_name("update_card_colors.py"),
)
_ucc = importlib.util.module_from_spec(_ucc_spec)
_ucc_spec.loader.exec_module(_ucc)

DEFAULT_BATCH_SIZE = 500
REQUIRED_FIELD_COVERAGE = 0.99  # KTD3: required fields on >= 99% of matched cards


def index_oracle_cards(path: str | None) -> dict[str, dict]:
    """Index a bulk file by ``oracle_id``.

    Objects without an ``oracle_id`` (e.g. ``reversible_card`` entries) are
    skipped. The first object per oracle id wins, so the index is stable
    regardless of duplicate printings in the file.
    """
    index: dict[str, dict] = {}
    for card in _ucc.iter_cards(path):
        oracle_id = card.get("oracle_id")
        if oracle_id:
            index.setdefault(oracle_id, card)
    return index


def required_field_problems(card: dict) -> list[str]:
    """KTD3 required fields: ``name``, ``type_line`` or ``card_faces``, images."""
    problems = []
    if not card.get("name"):
        problems.append("name")
    if not (card.get("type_line") or card.get("card_faces")):
        problems.append("type_line")
    has_image = card.get("image_uris") or any(
        (face.get("image_uris") or {}).get("normal")
        for face in card.get("card_faces") or []
    )
    if not has_image:
        problems.append("image_uris")
    return problems


def face_image_problem(card: dict) -> bool:
    """True when a double-faced card does not carry per-face images.

    Faces that share the top-level ``image_uris`` (split, adventure, flip,
    prototype, meld parts) are fine; transform/modal_dfc/battle faces need
    their own ``image_uris.normal``.
    """
    faces = card.get("card_faces") or []
    if not faces or card.get("image_uris"):
        return False
    return any(not (face.get("image_uris") or {}).get("normal") for face in faces)


def preflight(matched_cards: list[dict]) -> bool:
    """KTD3 pre-flight over the matched set; prints and returns False on fail."""
    missing = [card for card in matched_cards if required_field_problems(card)]
    no_face_images = [card for card in matched_cards if face_image_problem(card)]

    ok = True
    allowed_missing = len(matched_cards) * (1 - REQUIRED_FIELD_COVERAGE)
    if matched_cards and len(missing) > allowed_missing:
        ok = False
        sample = ", ".join(card.get("name", "?") for card in missing[:5])
        print(
            f"pre-flight failed: {len(missing)}/{len(matched_cards)} matched cards "
            f"miss required fields (name, type_line or card_faces, image uris): "
            f"{sample}",
            file=sys.stderr,
        )
    if no_face_images:
        ok = False
        sample = ", ".join(card.get("name", "?") for card in no_face_images[:5])
        print(
            f"pre-flight failed: {len(no_face_images)} double-faced card(s) miss "
            f"per-face images: {sample}",
            file=sys.stderr,
        )
    if not ok:
        print("aborting without writing", file=sys.stderr)
    return ok


def candidate_rows(session, refresh: bool) -> list:
    """Rows the backfill may write: all with ``--refresh``, else undone rows."""
    query = session.query(Card.id, Card.name, Card.scryfall_oracle_id)
    if not refresh:
        query = query.filter(Card.type_line.is_(None))
    return query.all()


def run(
    oracle_path: str | None,
    refresh: bool = False,
    dry_run: bool = False,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> int:
    index = index_oracle_cards(oracle_path)

    session_factory = get_session_factory()
    session = session_factory()
    try:
        rows = candidate_rows(session, refresh)
        all_oracle_ids = [oid for (oid,) in session.query(Card.scryfall_oracle_id)]
    finally:
        session.close()

    matched = [(row, index[row.scryfall_oracle_id]) for row in rows
               if row.scryfall_oracle_id in index]
    unmatched = [row for row in rows if row.scryfall_oracle_id not in index]

    # Judge the bulk file against every matched row, not just this run's
    # candidates: on a resume the leftovers are the cards a previous run
    # skipped, and on their own they would always fail the 1% tolerance.
    if not preflight([index[oid] for oid in all_oracle_ids if oid in index]):
        print(f"matched: {len(matched)}, updated: 0, unmatched: {len(unmatched)} "
              f"(aborted; nothing written)")
        return 1

    # Pre-flight tolerated these; writing them would leave a null type_line
    # that every rerun retries, so they are skipped instead.
    skipped = [(row, card) for row, card in matched
               if required_field_problems(card)]
    writable = [(row, card) for row, card in matched
                if not required_field_problems(card)]

    updated = 0
    if writable:
        if dry_run:
            updated = len(writable)
        else:
            session = session_factory()
            try:
                for chunk in batched(writable, batch_size):
                    # One executemany per chunk (ORM bulk UPDATE by primary
                    # key) carrying all eight KTD1 fields: ``type_line``
                    # doubles as the "done" marker for the resume filter.
                    session.execute(update(Card), [
                        {"id": row.id, **extract_scryfall_fields(card)}
                        for row, card in chunk
                    ])
                    session.commit()
                    updated += len(chunk)
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()

    mode = " (dry run; nothing written)" if dry_run else ""
    print(f"matched: {len(matched)}, updated: {updated}, "
          f"skipped: {len(skipped)}, unmatched: {len(unmatched)}{mode}")
    for row, card in skipped[:20]:
        print(f"  skipped: {card.get('name', row.name)} ({row.scryfall_oracle_id}): "
              f"missing {', '.join(required_field_problems(card))}")
    for row in unmatched[:20]:
        print(f"  unmatched: {row.name} ({row.scryfall_oracle_id})")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "--oracle",
        help="Scryfall oracle_cards .json/.jsonl[.gz]; downloaded if omitted",
    )
    ap.add_argument(
        "--refresh",
        action="store_true",
        help="rewrite rows that already have card data (default: only rows "
             "with null type_line, so an interrupted run resumes)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="run the pre-flight and report counts without writing",
    )
    ap.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"rows per transaction (default {DEFAULT_BATCH_SIZE})",
    )
    args = ap.parse_args(argv)
    try:
        return run(args.oracle, refresh=args.refresh, dry_run=args.dry_run,
                   batch_size=args.batch_size)
    except _ucc.DownloadError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
