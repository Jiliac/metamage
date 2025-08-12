from .utils import get_session
from .mcp import mcp
from ..models import Format, MetaChange


@mcp.tool
def list_formats() -> str:
    """
    List all available formats with their IDs and names.
    """
    with get_session() as session:
        formats = session.query(Format).order_by(Format.name).all()

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
    with get_session() as session:
        fmt = session.query(Format).filter(Format.id == format_id).first()
        if not fmt:
            return f"Format {format_id} not found"

        changes = (
            session.query(MetaChange)
            .filter(MetaChange.format_id == format_id)
            .order_by(MetaChange.date.desc())
            .all()
        )

    if not changes:
        return f"No meta changes found for format {format_id}"

    changes_list = []
    for change in changes:
        change_text = (
            f"**{change.date.strftime('%Y-%m-%d')}** - {change.change_type.value}"
        )
        if change.set_code:
            change_text += f" ({change.set_code})"
        if change.description:
            change_text += f": {change.description}"
        changes_list.append(change_text)

    changes_summary = "\n".join(changes_list)

    return f"""# {fmt.name} Meta Changes

{changes_summary}

These changes affect the competitive landscape and deck building considerations."""
