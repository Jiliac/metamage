from sqlalchemy import create_engine, event, Column, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func
import os
import uuid

Base = declarative_base()

DATABASE_URL = "sqlite:///data/tournament.db"


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


def get_engine():
    """Create and configure SQLite engine with optimizations."""
    engine = create_engine(
        _build_database_url(),
        echo=False,
        connect_args={
            "check_same_thread": False,  # Allow multi-threading
            "timeout": 20,  # Connection timeout
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


def get_session_factory():
    """Create session factory."""
    engine = get_engine()
    return sessionmaker(bind=engine)


def get_database_path():
    """Get the full path to the database file."""
    # Get the directory containing this file (src/models/)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up two levels to project root, then to data/tournament.db
    project_root = os.path.dirname(os.path.dirname(current_dir))
    return os.path.join(project_root, "data", "tournament.db")


def _build_database_url():
    """
    Build an absolute SQLite URL. Honors TOURNAMENT_DB_PATH if set,
    otherwise uses the repository's data/tournament.db.
    """
    env_path = os.getenv("TOURNAMENT_DB_PATH")
    db_path = (
        os.path.abspath(env_path) if env_path else os.path.abspath(get_database_path())
    )
    return f"sqlite:///{db_path}"
