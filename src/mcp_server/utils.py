from datetime import datetime, timedelta
from contextlib import contextmanager
from typing import Optional
from sqlalchemy import event, text
from ..models import get_engine, get_session_factory, get_alias_write_engine
import re
import time


engine = get_engine()

# Session factory for ORM usage
session_factory = get_session_factory()

# Write-enabled engine for alias operations only
alias_write_engine = get_alias_write_engine()

# Rate limiting constants
MAX_ALIASES_PER_SESSION = 10
RATE_LIMIT_WINDOW_SECONDS = 60

# Per-session rate limiting storage
_session_alias_insertions = {}  # session_id -> list of timestamps

# Alias validation pattern: alphanumeric, spaces, hyphens only, 1-100 chars
ALIAS_PATTERN = re.compile(r"^[a-zA-Z0-9\s\-]{1,100}$")

# Exact SQL pattern allowed for alias insertions
ALLOWED_ALIAS_SQL = "INSERT INTO archetype_aliases (id, alias, archetype_id, confidence_score, source) VALUES (:alias_id, :alias, :archetype_id, :confidence_score, :source)"


@contextmanager
def get_session():
    """
    Yield a SQLAlchemy ORM Session bound to the same read-only engine.
    """
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@event.listens_for(engine, "connect")
def _set_ro_pragmas(dbapi_connection, connection_record):
    cur = dbapi_connection.cursor()
    cur.execute("PRAGMA query_only=ON")
    cur.close()


def validate_select_only(sql: str) -> str:
    """
    Allow only a single SELECT/CTE statement; block PRAGMA/DDL/DML/transactions/etc.
    Returns the SQL trimmed of a trailing semicolon.
    """
    if not isinstance(sql, str):
        raise ValueError("SQL must be a string")
    s = sql.strip()
    if s.endswith(";"):
        s = s[:-1].strip()
    lowered = s.lower()
    if not (lowered.startswith("select") or lowered.startswith("with")):
        raise ValueError("Only SELECT queries are allowed (including WITH ... SELECT).")
    forbidden = [
        "insert",
        "update",
        "delete",
        "alter",
        "drop",
        "create",
        "attach",
        "detach",
        "pragma",
        "begin",
        "commit",
        "rollback",
        "vacuum",
        "reindex",
        "replace",
    ]
    if any(f in lowered for f in forbidden):
        raise ValueError(
            "Query contains forbidden keywords; only read-only SELECT is allowed."
        )
    if ";" in s:
        raise ValueError("Multiple statements are not allowed.")
    return s


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


def check_session_rate_limit(session_id: str) -> bool:
    """
    Check if session can insert a new alias (max 10 per 60 seconds).
    Returns True if allowed, False if rate limit exceeded.
    """
    if not session_id:
        # If no session_id, allow but log warning
        return True

    current_time = time.time()
    cutoff_time = current_time - RATE_LIMIT_WINDOW_SECONDS

    # Get or create session's insertion history
    if session_id not in _session_alias_insertions:
        _session_alias_insertions[session_id] = []

    session_history = _session_alias_insertions[session_id]

    # Remove old entries outside the time window
    session_history[:] = [t for t in session_history if t > cutoff_time]

    # Check if under the limit
    if len(session_history) >= MAX_ALIASES_PER_SESSION:
        return False

    # Record this attempt
    session_history.append(current_time)
    return True


def validate_alias_string(alias: str) -> tuple[bool, str]:
    """
    Validate alias string: alphanumeric + spaces/hyphens only, length 1-100.
    Returns (is_valid, error_message).
    """
    if not isinstance(alias, str):
        return False, "Invalid input format provided"

    if not alias.strip():
        return False, "Invalid input format provided"

    if not ALIAS_PATTERN.match(alias):
        return False, "Invalid input format provided"

    return True, ""


def validate_archetype_exists(engine, archetype_id: str) -> bool:
    """
    Pre-validate that archetype_id exists in the archetypes table.
    Returns True if exists, False otherwise.
    """
    try:
        check_sql = "SELECT 1 FROM archetypes WHERE id = :archetype_id LIMIT 1"
        with engine.connect() as conn:
            result = conn.execute(
                text(check_sql), {"archetype_id": archetype_id}
            ).first()
            return result is not None
    except Exception:
        return False


def validate_alias_insert_sql(sql: str) -> bool:
    """
    Ensure SQL matches the exact allowed pattern for archetype_aliases INSERT.
    Returns True if valid, False otherwise.
    """
    if not isinstance(sql, str):
        return False

    # Remove extra whitespace and normalize
    normalized_sql = " ".join(sql.strip().split())
    allowed_normalized = " ".join(ALLOWED_ALIAS_SQL.split())

    return normalized_sql == allowed_normalized
