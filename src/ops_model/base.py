from sqlalchemy import create_engine, event, Column, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func
import os
import uuid
from pathlib import Path

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


def get_ops_database_path() -> str:
    """
    Default path to the internal Ops database file (data/ops.db).
    """
    # project root = src/.. (repo root)
    project_root = Path(__file__).resolve().parents[2]
    return str(project_root / "data" / "ops.db")


def _build_ops_database_url() -> str:
    """
    Build an absolute SQLite URL for the internal Ops database.

    Honors OPS_DB_PATH if set (preferred), otherwise BRIDGE_DB_PATH for backward compat,
    else falls back to data/ops.db.
    """
    env_path = os.getenv("OPS_DB_PATH") or os.getenv("BRIDGE_DB_PATH")
    db_path = os.path.abspath(env_path) if env_path else os.path.abspath(get_ops_database_path())
    return f"sqlite:///{db_path}"


def get_ops_engine():
    """Create and configure SQLite engine with optimizations for the Ops database."""
    engine = create_engine(
        _build_ops_database_url(),
        echo=False,
        connect_args={
            "check_same_thread": False,  # Allow multi-threading
            "timeout": 20,               # Connection timeout
        },
        pool_pre_ping=True,
        pool_recycle=300,
    )

    # Enable WAL mode and foreign keys for SQLite
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


def get_ops_session_factory():
    """Create session factory for the Ops database."""
    engine = get_ops_engine()
    return sessionmaker(bind=engine)
