from sqlalchemy import text

from .utils import engine
from .mcp import mcp


@mcp.tool
def list_formats() -> str:
    """
    List all available formats with their IDs and names.
    """
    sql = """
        SELECT id, name
        FROM formats
        ORDER BY name
    """

    with engine.connect() as conn:
        formats = conn.execute(text(sql)).fetchall()

    if not formats:
        return "No formats found in database"

    format_list = "\n".join([f"- {row.name}: {row.id}" for row in formats])

    return f"""# Available MTG Formats

{format_list}

Use these format IDs in other tools to query specific format data."""


@mcp.tool
def get_format_meta_changes(format_id: str) -> str:
    """
    Get all meta changes (bans, set releases) for a format.
    """
    sql = """
        SELECT 
            mc.date,
            mc.change_type,
            mc.description,
            mc.set_code
        FROM meta_changes mc
        JOIN formats f ON mc.format_id = f.id
        WHERE f.id = :format_id
        ORDER BY mc.date DESC
    """

    with engine.connect() as conn:
        changes = conn.execute(text(sql), {"format_id": format_id}).fetchall()

    if not changes:
        return f"No meta changes found for format {format_id}"

    # Get format name
    format_sql = "SELECT name FROM formats WHERE id = :format_id"
    with engine.connect() as conn:
        format_name = conn.execute(text(format_sql), {"format_id": format_id}).scalar()

    if not format_name:
        return f"Format {format_id} not found"

    changes_list = []
    for change in changes:
        change_text = f"**{change.date.strftime('%Y-%m-%d')}** - {change.change_type}"
        if change.set_code:
            change_text += f" ({change.set_code})"
        if change.description:
            change_text += f": {change.description}"
        changes_list.append(change_text)

    changes_summary = "\n".join(changes_list)

    return f"""# {format_name} Meta Changes

{changes_summary}

These changes affect the competitive landscape and deck building considerations."""
