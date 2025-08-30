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
    Build database URL for the internal Ops database.

    Priority order:
    1. POSTGRES_URL (for Neon/PostgreSQL)
    2. OPS_DB_PATH (custom SQLite path)
    3. BRIDGE_DB_PATH (backward compatibility)
    4. Default: data/ops.db (SQLite fallback)
    """
    # Check for PostgreSQL URL first
    postgres_url = os.getenv("POSTGRES_URL")
    if postgres_url:
        return postgres_url
    
    # Fall back to SQLite
    env_path = os.getenv("OPS_DB_PATH") or os.getenv("BRIDGE_DB_PATH")
    db_path = (
        os.path.abspath(env_path)
        if env_path
        else os.path.abspath(get_ops_database_path())
    )
    return f"sqlite:///{db_path}"


def get_ops_engine():
    """Create and configure database engine with optimizations."""
    database_url = _build_ops_database_url()
    
    # Configure based on database type
    if database_url.startswith("postgresql://"):
        # PostgreSQL configuration
        engine = create_engine(
            database_url,
            echo=False,
            pool_pre_ping=True,
            pool_recycle=3600,  # Longer for cloud databases
            pool_size=10,
            max_overflow=20,
        )
    else:
        # SQLite configuration
        engine = create_engine(
            database_url,
            echo=False,
            connect_args={
                "check_same_thread": False,  # Allow multi-threading
                "timeout": 20,  # Connection timeout
            },
            pool_pre_ping=True,
            pool_recycle=300,
        )

        # Enable WAL mode and foreign keys for SQLite only
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
