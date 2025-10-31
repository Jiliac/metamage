"""Utilities for ChatGPT MCP app."""

from datetime import datetime
from contextlib import contextmanager
from src.models import get_engine, get_session_factory

# Create engine for database access
engine = get_engine()

# Session factory for ORM usage
session_factory = get_session_factory()


@contextmanager
def get_session():
    """
    Yield a SQLAlchemy ORM Session.
    """
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def validate_date_range(start_date: str, end_date: str) -> tuple[datetime, datetime]:
    """
    Validate and parse ISO date strings, ensuring end_date >= start_date.
    Returns (start, end) as datetime objects.
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except Exception:
        raise ValueError(
            "Dates must be ISO format (e.g., 2025-01-01 or 2025-01-01T00:00:00)"
        )
    if end < start:
        raise ValueError("end_date must be >= start_date")
    return start, end
