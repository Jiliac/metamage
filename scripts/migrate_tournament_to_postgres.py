#!/usr/bin/env python3
"""One-time backfill of the tournament SQLite DB into Postgres (Neon).

Unlike scripts/migrate_to_postgres.py (Ops DB, per-row), this:
  * bootstraps the schema with create_all + `alembic stamp head` (the established
    pattern; replaying the batch-mode migration history fails on a fresh DB), and
  * transfers data with chunked bulk_insert_mappings in FK-dependency order over a
    direct connection — sized for ~1.1M matches and millions of deck_cards.

UUID string PKs are copied verbatim. Ends with a per-table row-count parity check.

Usage:
    TOURNAMENT_DATABASE_URL=postgresql://...  # target (use the rw role)
    uv run scripts/migrate_tournament_to_postgres.py [--sqlite PATH] [--force] [--chunk N]
"""

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, func, select
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


def drop_relaxed_fks(target_engine) -> None:
    from sqlalchemy import text

    with target_engine.begin() as conn:
        for table, name, _ in RELAXED_FKS:
            conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}"))
    if RELAXED_FKS:
        print(f"Dropped {len(RELAXED_FKS)} orphan-tolerant FK(s) for bulk load.")


def readd_relaxed_fks_not_valid(target_engine) -> None:
    from sqlalchemy import text

    with target_engine.begin() as conn:
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


def transfer(source_session, target_session, chunk_size: int) -> dict:
    counts = {}
    for model in TRANSFER_ORDER:
        table = model.__tablename__
        total = 0
        batch = []
        # Stream the source to keep memory flat on large tables.
        for row in (
            source_session.execute(select(model)).yield_per(chunk_size).scalars()
        ):
            batch.append(_row_to_dict(row, model))
            if len(batch) >= chunk_size:
                target_session.bulk_insert_mappings(model, batch)
                target_session.commit()
                total += len(batch)
                batch = []
        if batch:
            target_session.bulk_insert_mappings(model, batch)
            target_session.commit()
            total += len(batch)
        counts[table] = total
        print(f"  transferred {table}: {total}")
    return counts


def verify(source_session, target_session) -> bool:
    print("\nVerifying row-count parity...")
    ok = True
    for model in TRANSFER_ORDER:
        table = model.__tablename__
        src = source_session.scalar(select(func.count()).select_from(model))
        tgt = target_session.scalar(select(func.count()).select_from(model))
        mark = "OK" if src == tgt else "MISMATCH"
        if src != tgt:
            ok = False
        print(f"  {mark:8} {table}: sqlite={src} postgres={tgt}")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", default=None, help="Source SQLite path")
    parser.add_argument("--chunk", type=int, default=5000)
    parser.add_argument(
        "--force", action="store_true", help="Proceed even if target has rows"
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

        drop_relaxed_fks(target_engine)
        transfer(source_session, target_session, args.chunk)
        readd_relaxed_fks_not_valid(target_engine)
        ok = verify(source_session, target_session)
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
