from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

Base = declarative_base()

DATABASE_URL = "sqlite:///data/tournament.db"

def get_engine():
    """Create and configure SQLite engine with optimizations."""
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        connect_args={
            "check_same_thread": False,  # Allow multi-threading
            "timeout": 20,  # Connection timeout
        },
        pool_pre_ping=True,
        pool_recycle=300,
    )
    
    # Enable WAL mode and foreign keys for SQLite
    @engine.event.listens_for(engine, "connect")
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
    return os.path.abspath("data/tournament.db")