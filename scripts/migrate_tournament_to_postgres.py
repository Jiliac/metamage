#!/usr/bin/env python3
"""One-time backfill of the tournament SQLite DB into Postgres (Neon).

Unlike scripts/migrate_to_postgres.py (Ops DB, per-row), this:
  * bootstraps the schema with create_all + `alembic stamp head` (the established
    pattern; replaying the batch-mode migration history fails on a fresh DB), and
  * transfers data with chunked COPY (CSV over STDIN) in FK-dependency order —
    bulk_insert_mappings' per-row INSERTs cap at ~2K rows/s even locally; COPY
    is sized for ~1.3M matches and ~8.8M deck_cards.

UUID string PKs are copied verbatim. Archetype rows that collide once lowercased
(SQLite's binary UNIQUE allows 'Tasigur' and 'tasigur'; the Postgres lowercasing
shim does not) are merged into their canonical twins with in-flight FK remap.
Ends with a per-table row-count parity check plus read-only value checks
(merge landed, shim invariant holds, '' survived COPY as '' not NULL).

Usage:
    TOURNAMENT_DATABASE_URL=postgresql://...  # target (use the rw role)
    uv run scripts/migrate_tournament_to_postgres.py [--sqlite PATH] [--force] [--chunk N]
"""

import argparse
import csv
import io
import os
import sys
from enum import Enum
from pathlib import Path

from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from models import (  # noqa: E402
    Base,
    Format,
    Set,
    Player,
    Card,
    CardColor,
    Archetype,
    MetaChange,
    Tournament,
    TournamentEntry,
    DeckCard,
    Match,
)
from models.base import get_database_path  # noqa: E402
from models.reference import ArchetypeAlias  # noqa: E402

load_dotenv()

# FK-dependency order: parents before children. A missing table here would be
# silently skipped by BOTH transfer and the parity check, so this list is
# explicit and every model is imported hard (fail loud, not silently partial).
TRANSFER_ORDER = [
    Format,
    Set,
    Player,
    Card,
    CardColor,
    Archetype,
    ArchetypeAlias,
    MetaChange,
    Tournament,
    TournamentEntry,
    DeckCard,
    Match,
]


def _normalize_pg_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def _row_to_dict(row, model):
    return {c.name: getattr(row, c.name) for c in model.__table__.columns}


# ---------------------------------------------------------------------------
# Case-collision dedupe (source-side detection, transfer-time merge)
#
# SQLite's UNIQUE comparisons use binary collation, so rows differing only by
# case coexist; CaseInsensitiveText lowercases every value on the Postgres
# write path, so such rows would violate UNIQUE(format_id, name). Rather than
# mutate the user's SQLite source, duplicates are folded into their canonical
# (already-lowercase) twin here, remapping FK references in flight.
#
# Other shimmed columns cannot collide on transfer: Format.name has no mixed-
# case rows in the source, Player.normalized_handle and Card.name carry no
# unique constraint, and archetype_aliases.alias is not shimmed (verbatim
# transfer preserves its case-sensitive uniqueness on both dialects).
# ---------------------------------------------------------------------------

# Tables with a direct archetype FK, by column name.
ARCHETYPE_FK_COLUMNS = {
    "tournament_entries": "archetype_id",
    "archetype_aliases": "archetype_id",
}


def find_archetype_collisions(source_session) -> dict:
    """Return {duplicate_id: canonical_id} for lowercased-name collisions.

    A collision group is any set of archetype rows in one format sharing a
    lowercased name. The canonical member is an already-lowercase row (the
    shim's stored invariant); if the group has none, the smallest id wins so
    repeated runs always merge the same way. Every other member is a
    duplicate to fold away.
    """
    rows = source_session.execute(
        select(Archetype.id, Archetype.name, Archetype.format_id)
    ).all()
    groups: dict = {}
    for id_, name, format_id in rows:
        groups.setdefault((format_id, name.lower()), []).append((id_, name))
    remap: dict = {}
    for members in groups.values():
        if len(members) < 2:
            continue
        canonical = next((m[0] for m in members if m[1] == m[1].lower()), None)
        if canonical is None:
            canonical = min(m[0] for m in members)
        for id_, _ in members:
            if id_ != canonical:
                remap[id_] = canonical
    return remap


def bootstrap_schema(target_engine, target_url: str) -> None:
    """create_all + `alembic stamp head` so future migrations have a baseline."""
    print("Creating schema on target (create_all)...")
    Base.metadata.create_all(target_engine)

    print("Stamping alembic head...")
    from alembic.config import Config
    from alembic import command

    os.environ["TOURNAMENT_DATABASE_URL"] = target_url
    cfg = Config(str(Path(__file__).parent.parent / "alembic.ini"))
    command.stamp(cfg, "head")


# FK constraints whose parent table has orphaned children in the legacy SQLite
# source (SQLite never enforced FKs, so ~37.6K tournament_entries reference
# tournaments that were deleted upstream). Postgres would reject those rows on
# insert. We drop these FKs before the bulk load and re-add them NOT VALID after:
# the constraint then guards every NEW write but does not retroactively reject the
# historical orphans — preserving row-count parity with SQLite. Fixing the orphans
# (restoring the missing tournaments) is a separate upstream data-quality task.
RELAXED_FKS = [
    (
        "tournament_entries",
        "fk_tournament_entries_tournament",
        "FOREIGN KEY (tournament_id) REFERENCES tournaments(id)",
    ),
]


# ALTER TABLE queues behind any transaction still holding a lock on the table.
# A bounded wait turns a residual self-lock into a loud error instead of a hang.
DDL_LOCK_TIMEOUT = "30s"


def drop_relaxed_fks(target_engine) -> None:
    with target_engine.begin() as conn:
        conn.execute(text(f"SET LOCAL lock_timeout = '{DDL_LOCK_TIMEOUT}'"))
        for table, name, _ in RELAXED_FKS:
            conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}"))
    if RELAXED_FKS:
        print(f"Dropped {len(RELAXED_FKS)} orphan-tolerant FK(s) for bulk load.")


def readd_relaxed_fks_not_valid(target_engine) -> None:
    with target_engine.begin() as conn:
        conn.execute(text(f"SET LOCAL lock_timeout = '{DDL_LOCK_TIMEOUT}'"))
        for table, name, defn in RELAXED_FKS:
            conn.execute(
                text(f"ALTER TABLE {table} ADD CONSTRAINT {name} {defn} NOT VALID")
            )
    if RELAXED_FKS:
        print(f"Re-added {len(RELAXED_FKS)} FK(s) as NOT VALID (guards new writes).")


def target_is_empty(target_session) -> bool:
    for model in TRANSFER_ORDER:
        count = target_session.scalar(select(func.count()).select_from(model))
        if count:
            return False
    return True


# COPY's CSV default treats an unquoted empty field as NULL, and csv.writer
# emits '' exactly that way — so None and '' would both land as NULL. The
# source does store real empty strings (cards.colors = '' marks colorless;
# 741 rows on 2026-09-27), so None gets an explicit sentinel instead.
COPY_NULL = r"\N"


def _copy_cell(v):
    """Coerce an ORM-loaded value to a CSV cell for COPY.

    None becomes COPY_NULL (declared via the COPY NULL option) so that a
    real '' survives as an empty string. Python enum members render as
    their stored VARCHAR value; bools as t/f; dates/datetimes via str() in
    ISO form, which Postgres parses natively.
    """
    if v is None:
        return COPY_NULL
    if isinstance(v, bool):
        return "t" if v else "f"
    if isinstance(v, Enum):
        return v.value
    return v


def _copy_batch(target_session, model, rows) -> None:
    """Stream one batch into the target via COPY (CSV over STDIN).

    bulk_insert_mappings renders one INSERT per row, which psycopg2 executes
    statement-by-statement — ~2K rows/s even on localhost, and hours over a
    WAN link. COPY pushes the same batch as a single CSV payload.
    """
    columns = [c.name for c in model.__table__.columns]
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    for row_dict in rows:
        writer.writerow([_copy_cell(row_dict[c]) for c in columns])
    buf.seek(0)
    dbapi = target_session.connection().connection.dbapi_connection
    cursor = dbapi.cursor()
    cursor.copy_expert(
        f"COPY {model.__table__.name} ({', '.join(columns)}) "
        f"FROM STDIN WITH (FORMAT csv, NULL '{COPY_NULL}')",
        buf,
    )
    cursor.close()


def _bump(counter: dict, key: str) -> None:
    counter[key] = counter.get(key, 0) + 1


def _alias_owners(source_session, archetype_remap) -> set:
    """Archetype ids that keep their own alias row through the merge.

    archetype_aliases.archetype_id is UNIQUE, so a duplicate twin's alias can
    only be re-pointed at a canonical that does not already own one.
    """
    owners = source_session.execute(select(ArchetypeAlias.archetype_id)).scalars()
    return {a for a in owners if a not in archetype_remap}


def _fold_row(table, row_dict, archetype_remap, alias_owners, dedupe) -> bool:
    """Apply the archetype merge to one row in place; False means drop it."""
    if table == "archetypes" and row_dict["id"] in archetype_remap:
        _bump(dedupe["skipped"], table)
        return False
    fk_col = ARCHETYPE_FK_COLUMNS.get(table)
    if not fk_col or row_dict[fk_col] not in archetype_remap:
        return True
    canonical = archetype_remap[row_dict[fk_col]]
    if table == "archetype_aliases":
        if canonical in alias_owners:
            _bump(dedupe["skipped"], table)
            print(
                f"  dropped alias {row_dict['alias']!r} ({row_dict['id']}): "
                f"canonical {canonical} already owns an alias"
            )
            return False
        alias_owners.add(canonical)
    row_dict[fk_col] = canonical
    _bump(dedupe["remapped"], table)
    return True


def _flush(target_session, model, batch) -> int:
    _copy_batch(target_session, model, batch)
    target_session.commit()
    return len(batch)


def transfer(source_session, target_session, chunk_size, archetype_remap) -> tuple:
    """Copy every table in FK order, folding archetype case-collisions away.

    Duplicate archetype rows (same format, same lowercased name) are skipped;
    rows in ARCHETYPE_FK_COLUMNS tables pointing at a duplicate are re-pointed
    at its canonical twin in flight. An alias whose canonical already owns one
    is dropped instead (UNIQUE archetype_id). Returns (row_counts, dedupe)
    where dedupe reports skipped and remapped rows per table.
    """
    counts = {}
    dedupe = {"skipped": {}, "remapped": {}}
    alias_owners = _alias_owners(source_session, archetype_remap)
    for model in TRANSFER_ORDER:
        table = model.__tablename__
        total = 0
        batch = []
        # Stream the source to keep memory flat on large tables.
        for row in (
            source_session.execute(select(model)).yield_per(chunk_size).scalars()
        ):
            row_dict = _row_to_dict(row, model)
            if not _fold_row(table, row_dict, archetype_remap, alias_owners, dedupe):
                continue
            batch.append(row_dict)
            if len(batch) >= chunk_size:
                total += _flush(target_session, model, batch)
                batch = []
        if batch:
            total += _flush(target_session, model, batch)
        counts[table] = total
        print(f"  transferred {table}: {total}")
    return counts, dedupe


def transfer_with_relaxed_fks(
    source_session, target_session, target_engine, chunk_size, archetype_remap
) -> tuple:
    """Run transfer() between the FK drop and its NOT VALID re-add."""
    drop_relaxed_fks(target_engine)
    try:
        return transfer(source_session, target_session, chunk_size, archetype_remap)
    finally:
        # Always re-balance the drop, even if transfer raised, so an aborted
        # run never leaves the target with the FK missing. A failed COPY leaves
        # target_session's transaction aborted but still holding ROW EXCLUSIVE
        # on the table it was loading; ADD CONSTRAINT runs on another
        # connection and would queue behind it forever, so release it first.
        target_session.rollback()
        readd_relaxed_fks_not_valid(target_engine)


def _count(session, model, *where) -> int:
    stmt = select(func.count()).select_from(model)
    return session.scalar(stmt.where(*where) if where else stmt)


def _check(label: str, actual, expected) -> bool:
    ok = actual == expected
    print(
        f"  {'OK' if ok else 'MISMATCH':8} {label}: expected={expected} actual={actual}"
    )
    return ok


def _verify_row_counts(source_session, target_session, expected_skips) -> bool:
    print("\nVerifying row-count parity...")
    ok = True
    for model in TRANSFER_ORDER:
        table = model.__tablename__
        src = source_session.scalar(select(func.count()).select_from(model))
        tgt = target_session.scalar(select(func.count()).select_from(model))
        skipped = expected_skips.get(table, 0)
        expected = src - skipped
        mark = "OK" if tgt == expected else "MISMATCH"
        if tgt != expected:
            ok = False
        note = f" ({skipped} deduped case-collision row(s))" if skipped else ""
        print(f"  {mark:8} {table}: sqlite={src} postgres={tgt}{note}")
    return ok


def _verify_archetype_merge(source_session, target_session, archetype_remap) -> bool:
    """Value-level proof that the case-collision merge landed (read-only)."""
    print("Verifying archetype merge...")
    lowered = func.lower(Archetype.name)
    colliding = (
        select(Archetype.format_id, lowered)
        .group_by(Archetype.format_id, lowered)
        .having(func.count() > 1)
    )
    checks = [
        (
            "archetypes colliding once lowercased",
            len(target_session.execute(colliding).all()),
            0,
        ),
        (
            "archetypes with name <> lower(name)",
            _count(target_session, Archetype, Archetype.name != lowered),
            0,
        ),
    ]
    dup_ids = list(archetype_remap)
    if dup_ids:
        for model in (TournamentEntry, ArchetypeAlias):
            checks.append(
                (
                    f"{model.__tablename__} still pointing at a folded archetype",
                    _count(target_session, model, model.archetype_id.in_(dup_ids)),
                    0,
                )
            )
    for canonical in sorted(set(archetype_remap.values())):
        twins = [canonical] + [d for d, c in archetype_remap.items() if c == canonical]
        checks.append(
            (
                f"tournament_entries owned by {canonical} (union of {len(twins)} twins)",
                _count(
                    target_session,
                    TournamentEntry,
                    TournamentEntry.archetype_id == canonical,
                ),
                _count(
                    source_session,
                    TournamentEntry,
                    TournamentEntry.archetype_id.in_(twins),
                ),
            )
        )
    return all([_check(*c) for c in checks])


def _verify_copy_values(source_session, target_session) -> bool:
    """Spot-check a COPY coercion that row counts cannot see: '' is not NULL."""
    print("Verifying COPY value coercions...")
    return _check(
        "cards with colors = '' (colorless, not NULL)",
        _count(target_session, Card, Card.colors == ""),
        _count(source_session, Card, Card.colors == ""),
    )


def verify(source_session, target_session, archetype_remap, transfer_skips) -> bool:
    """Row-count parity plus value-level checks; True only if every check holds.

    The archetypes skip count is recomputed from the remap itself rather than
    taken from transfer()'s counter, so the loop that did the skipping cannot
    vouch for itself; a disagreement surfaces as a row-count MISMATCH.
    """
    expected_skips = {**transfer_skips, "archetypes": len(archetype_remap)}
    results = [
        _verify_row_counts(source_session, target_session, expected_skips),
        _verify_archetype_merge(source_session, target_session, archetype_remap),
        _verify_copy_values(source_session, target_session),
    ]
    return all(results)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", default=None, help="Source SQLite path")
    parser.add_argument("--chunk", type=int, default=5000)
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Bypass the empty-target check. COPY appends, so rows already in "
            "the target collide on duplicate PKs unless the tables are "
            "truncated first."
        ),
    )
    args = parser.parse_args()

    target_url = os.getenv("TOURNAMENT_DATABASE_URL")
    if not target_url:
        print("ERROR: TOURNAMENT_DATABASE_URL (Postgres target) is required")
        return 1
    target_url = _normalize_pg_url(target_url)
    if not target_url.startswith("postgresql"):
        print("ERROR: TOURNAMENT_DATABASE_URL must be a Postgres URL")
        return 1

    sqlite_path = args.sqlite or os.getenv("TOURNAMENT_DB_PATH") or get_database_path()
    sqlite_path = os.path.abspath(sqlite_path)
    if not os.path.exists(sqlite_path):
        print(f"ERROR: source SQLite not found at {sqlite_path}")
        return 1

    source_engine = create_engine(f"sqlite:///{sqlite_path}")
    target_engine = create_engine(target_url, pool_pre_ping=True)

    print(f"Source: sqlite:///{sqlite_path}")
    print(f"Target: {target_url.split('@')[-1]}")

    bootstrap_schema(target_engine, target_url)

    SourceSession = sessionmaker(bind=source_engine)
    TargetSession = sessionmaker(bind=target_engine)
    source_session = SourceSession()
    target_session = TargetSession()

    try:
        if not target_is_empty(target_session) and not args.force:
            print("ERROR: target already has data. Re-run with --force to proceed.")
            return 1
        # target_is_empty's SELECTs open a read transaction that holds ACCESS
        # SHARE locks; drop_relaxed_fks' ALTER TABLE runs on a different
        # connection and needs ACCESS EXCLUSIVE — without this rollback the
        # script queues behind its own transaction and deadlocks with itself.
        target_session.rollback()

        archetype_remap = find_archetype_collisions(source_session)
        if archetype_remap:
            print(
                f"\nMerging {len(archetype_remap)} case-collision archetype(s): "
                "SQLite's binary UNIQUE lets rows differing only by case "
                "coexist; the Postgres lowercasing shim cannot. Duplicates "
                "fold into their canonical (already-lowercase) twins."
            )
            for dup_id, canon_id in archetype_remap.items():
                print(f"  {dup_id} -> {canon_id}")

        _, dedupe = transfer_with_relaxed_fks(
            source_session, target_session, target_engine, args.chunk, archetype_remap
        )
        for table, n in dedupe["remapped"].items():
            print(f"  dedupe FK remap: {table}: {n} row(s) re-pointed")
        ok = verify(source_session, target_session, archetype_remap, dedupe["skipped"])
        if not ok:
            print("\nParity check FAILED.")
            return 1
        print("\nParity check passed. Migration complete.")
        return 0
    finally:
        source_session.close()
        target_session.close()


if __name__ == "__main__":
    sys.exit(main())
