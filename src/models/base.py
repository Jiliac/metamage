from sqlalchemy import create_engine, event, Column, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func
import os
import uuid
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()


def generate_uuid():
    """Generate a UUID string for primary keys."""
    return str(uuid.uuid4())


def uuid_pk():
    """Create a UUID primary key column."""
    return Column(String(36), primary_key=True, default=generate_uuid)


class TimestampMixin:
    """Mixin to add created_at and updated_at timestamps to models."""

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


def get_database_path():
    """Get the full path to the SQLite database file (dev fallback)."""
    # Get the directory containing this file (src/models/)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up two levels to project root, then to data/tournament.db
    project_root = os.path.dirname(os.path.dirname(current_dir))
    return os.path.join(project_root, "data", "tournament.db")


def _build_database_url():
    """
    Build the tournament database URL.

    Priority order:
    1. TOURNAMENT_DATABASE_URL (Postgres/Neon) — normalized to the
       ``postgresql://`` scheme so the dialect check below matches.
    2. TOURNAMENT_DB_PATH (custom SQLite path) — dev fallback.
    3. Default: data/tournament.db (SQLite fallback).
    """
    postgres_url = os.getenv("TOURNAMENT_DATABASE_URL")
    if postgres_url:
        # Neon (and some providers) emit ``postgres://``; SQLAlchemy and the
        # dialect check below expect ``postgresql://``.
        if postgres_url.startswith("postgres://"):
            postgres_url = "postgresql://" + postgres_url[len("postgres://") :]
        return postgres_url

    env_path = os.getenv("TOURNAMENT_DB_PATH")
    db_path = (
        os.path.abspath(env_path) if env_path else os.path.abspath(get_database_path())
    )
    return f"sqlite:///{db_path}"


def _is_postgres(url):
    return url.startswith("postgresql://") or url.startswith("postgresql+")


def _create_engine(url):
    """
    Create a SQLAlchemy engine configured for the URL's dialect.

    Postgres gets cloud-friendly pooling; SQLite keeps the WAL / foreign-key
    pragmas via a connect listener. The read engine and the alias-write engine
    share this builder — read-only enforcement lives at the MCP layer
    (SQLite ``PRAGMA query_only`` / Postgres read-only role), not here.
    """
    if _is_postgres(url):
        return create_engine(
            url,
            echo=False,
            pool_pre_ping=True,
            pool_recycle=3600,  # Longer for cloud databases
            pool_size=10,
            max_overflow=20,
        )

    engine = create_engine(
        url,
        echo=False,
        connect_args={
            "check_same_thread": False,  # Allow multi-threading
            "timeout": 20,  # Connection timeout
        },
        pool_pre_ping=True,
        pool_recycle=300,
    )

    # Enable WAL mode and foreign keys for SQLite only.
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=10000")
        cursor.execute("PRAGMA temp_store=memory")
        cursor.close()

    return engine


def get_engine():
    """Create and configure the tournament database engine (read path)."""
    return _create_engine(_build_database_url())


def get_session_factory():
    """Create session factory."""
    return sessionmaker(bind=get_engine())


def get_alias_write_engine():
    """
    Create a write-enabled engine used ONLY for archetype_aliases operations.

    On SQLite this is identical to get_engine() (the read engine's read-only
    guard is applied separately at the MCP layer). On Postgres, wire this to a
    role that retains INSERT on archetype_aliases via a dedicated write URL.
    """
    write_url = os.getenv("TOURNAMENT_DATABASE_WRITE_URL")
    if write_url:
        if write_url.startswith("postgres://"):
            write_url = "postgresql://" + write_url[len("postgres://") :]
        return _create_engine(write_url)
    fallback_url = _build_database_url()
    if _is_postgres(fallback_url):
        logger.warning(
            "TOURNAMENT_DATABASE_WRITE_URL is not set while using Postgres; "
            "falling back to the read URL for archetype_aliases writes. "
            "Set a dedicated write URL with INSERT privileges to avoid runtime write failures."
        )
    return _create_engine(fallback_url)
