from typing import Dict, Any
from .utils import get_session
from .mcp import mcp
from fastmcp import Context
from .log_decorator import log_tool_calls
from ..models import Format, MetaChange


@log_tool_calls
@mcp.tool
def list_formats(ctx: Context = None) -> Dict[str, Any]:
    """
    List all available formats with their IDs and names.

    Workflow Integration:
    - Use this to discover format_id values for other tools.
    - Pair with get_format_meta_changes() to understand recent context before deeper analysis.

    Related Tools:
    - get_format_meta_changes(), get_meta_report(), get_sources()
    """
    with get_session() as session:
        formats = session.query(Format).order_by(Format.name).all()

    if not formats:
        return {"formats": [], "message": "No formats found in database"}

    format_list = [{"id": row.id, "name": row.name} for row in formats]

    return {"formats": format_list, "total_count": len(format_list)}


@log_tool_calls
@mcp.tool
def get_format_meta_changes(format_id: str, ctx: Context = None) -> Dict[str, Any]:
    """
    Get all meta changes (bans, set releases) for a format.

    Workflow Integration:
    - Use alongside get_archetype_trends() to explain trend shifts.
    - Bound analysis windows for other tools (get_meta_report(), get_card_presence(), etc.) to pre/post change dates.

    Related Tools:
    - list_formats(), get_meta_report(), get_archetype_trends(), query_database()
    """
    with get_session() as session:
        fmt = session.query(Format).filter(Format.id == format_id).first()
        if not fmt:
            return {"error": f"Format {format_id} not found"}

        changes = (
            session.query(MetaChange)
            .filter(MetaChange.format_id == format_id)
            .order_by(MetaChange.date.desc())
            .all()
        )

    if not changes:
        return {
            "format_id": format_id,
            "format_name": fmt.name,
            "meta_changes": [],
            "message": f"No meta changes found for format {format_id}",
        }

    changes_list = []
    for change in changes:
        change_data = {
            "date": change.date.strftime("%Y-%m-%d"),
            "change_type": change.change_type.value,
            "set_code": change.set_code,
            "description": change.description,
        }
        changes_list.append(change_data)

    return {
        "format_id": format_id,
        "format_name": fmt.name,
        "meta_changes": changes_list,
        "total_changes": len(changes_list),
    }
