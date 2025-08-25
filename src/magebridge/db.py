from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
import os


def get_bridge_database_path():
    """Get the full path to the bridge database file."""
    # Get the directory containing this file (src/magebridge/)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up two levels to project root, then to data/bridge.db
    project_root = os.path.dirname(os.path.dirname(current_dir))
    return os.path.join(project_root, "data", "bridge.db")


def _build_bridge_database_url():
    """
    Build an absolute SQLite URL for the bridge database.
    Honors BRIDGE_DB_PATH if set, otherwise uses the repository's data/bridge.db.
    """
    env_path = os.getenv("BRIDGE_DB_PATH")
    db_path = (
        os.path.abspath(env_path)
        if env_path
        else os.path.abspath(get_bridge_database_path())
    )
    return f"sqlite:///{db_path}"


def get_bridge_engine():
    """Create and configure SQLite engine with optimizations for bridge database."""
    engine = create_engine(
        _build_bridge_database_url(),
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


def get_bridge_session_factory():
    """Create session factory for bridge database."""
    engine = get_bridge_engine()
    return sessionmaker(bind=engine)
