"""Simple ChatGPT MCP app with a hello world tool."""

from __future__ import annotations

from typing import List

import mcp.types as types
from mcp.server.fastmcp import FastMCP
import json

try:
    from src.analysis.meta import compute_meta_report
    from src.analysis.archetype import compute_archetype_overview
    from src.analysis.matchup import compute_matchup_winrate
    from src.models import Format
    from .utils import engine as db_engine, validate_date_range, get_session
    from .query import execute_select_query
except Exception:
    compute_meta_report = None
    compute_archetype_overview = None
    compute_matchup_winrate = None
    Format = None
    db_engine = None
    validate_date_range = None
    get_session = None
    execute_select_query = None

# Create the MCP server
mcp = FastMCP(
    name="metamage",
    stateless_http=True,
)


@mcp._mcp_server.list_tools()
async def _list_tools() -> List[types.Tool]:
    """List available tools."""
    return [
        types.Tool(
            name="say-hello",
            title="Say Hello",
            description="A simple tool that returns 'Hello, World!'",
            inputSchema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="multiply",
            title="Multiply Numbers",
            description="Multiplies two numbers together and returns the result",
            inputSchema={
                "type": "object",
                "properties": {
                    "a": {
                        "type": "number",
                        "description": "First number",
                    },
                    "b": {
                        "type": "number",
                        "description": "Second number",
                    },
                },
                "required": ["a", "b"],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="get-meta-report",
            title="Metagame Report",
            description="Get top archetypes by match presence and winrate (excluding draws) over a date window. Use list-formats to get format_id. For 'recent meta', use last 30-60 days. Returns JSON with archetype stats including presence %, winrate %, matches, and entries.",
            inputSchema={
                "type": "object",
                "properties": {
                    "format_id": {
                        "type": "string",
                        "description": "Format UUID (get from list-formats)",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max archetypes to return (default 15, max 20)",
                    },
                },
                "required": ["format_id", "start_date", "end_date"],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="get-archetype-overview",
            title="Archetype Overview",
            description="Find an archetype by name using fuzzy matching (case-insensitive, partial names work) and get recent 30-day performance stats plus top 8 key cards. Returns archetype_id, format_id, format_name, recent entries/tournaments/winrate, and key cards with avg copies and adoption rate.",
            inputSchema={
                "type": "object",
                "properties": {
                    "archetype_name": {
                        "type": "string",
                        "description": "Full or partial archetype name (fuzzy matching supported, e.g. 'Yawg' matches 'Yawgmoth')",
                    }
                },
                "required": ["archetype_name"],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="query-database",
            title="Run SELECT Query",
            description="""Execute SELECT/CTE SQL queries against the MTG tournament database. Schema: tournaments(id, name, date, format_id, source, link), tournament_entries(id, tournament_id, player_id, archetype_id, wins, losses, draws, rank), matches(id, entry_id, opponent_entry_id, result, mirror, pair_id), deck_cards(id, entry_id, card_id, count, board), archetypes(id, format_id, name, color), cards(id, name, scryfall_oracle_id, is_land, colors, first_printed_set_id, first_printed_date), card_colors(id, card_id, color), sets(id, code, name, set_type, released_at), players(id, handle, normalized_handle). All IDs are UUID strings. DateTime fields need range queries (>= and <), not equality. Do NOT include LIMIT in SQL; it's added automatically.""",
            inputSchema={
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "SELECT or WITH...SELECT statement (no PRAGMA/DDL/DML/LIMIT). Use date ranges (t.date >= '2025-08-18' AND t.date < '2025-08-19'), not equality.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max rows to return (default 1000, max 10000)",
                    },
                },
                "required": ["sql"],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="get-matchup-winrate",
            title="Matchup Winrate",
            description="Compute head-to-head results and winrate (excluding draws) between two archetypes over a date window.",
            inputSchema={
                "type": "object",
                "properties": {
                    "format_id": {"type": "string", "description": "Format UUID"},
                    "archetype1_name": {
                        "type": "string",
                        "description": "First archetype name (case-insensitive)",
                    },
                    "archetype2_name": {
                        "type": "string",
                        "description": "Second archetype name (case-insensitive)",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                },
                "required": [
                    "format_id",
                    "archetype1_name",
                    "archetype2_name",
                    "start_date",
                    "end_date",
                ],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="list-formats",
            title="List Formats",
            description="List all available Magic: The Gathering formats with their UUIDs and names. Use this to discover format_id values needed for other tools (get-meta-report, etc.). Returns JSON array of formats with 'id' and 'name' fields.",
            inputSchema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
    ]


async def _call_tool_request(req: types.CallToolRequest) -> types.ServerResult:
    """Handle tool calls."""
    if req.params.name == "say-hello":
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text="Hello, World!",
                    )
                ],
            )
        )

    if req.params.name == "multiply":
        a = req.params.arguments.get("a")
        b = req.params.arguments.get("b")

        if a is None or b is None:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Error: Both 'a' and 'b' parameters are required",
                        )
                    ],
                    isError=True,
                )
            )

        result = a * b
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=str(result),
                    )
                ],
            )
        )

    if req.params.name == "get-meta-report":
        if (
            compute_meta_report is None
            or db_engine is None
            or validate_date_range is None
        ):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: metagame tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        fmt = args.get("format_id")
        start_str = args.get("start_date")
        end_str = args.get("end_date")
        lim = args.get("limit")
        if not (fmt and start_str and end_str):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Missing required parameters: format_id, start_date, end_date",
                        )
                    ],
                    isError=True,
                )
            )
        try:
            start_dt, end_dt = validate_date_range(start_str, end_str)
            limit_val = lim if isinstance(lim, int) and lim > 0 else 15
            result = compute_meta_report(db_engine, fmt, start_dt, end_dt, limit_val)
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text=json.dumps(result, default=str),
                        )
                    ],
                )
            )
        except Exception as e:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text=f"Error: {e}",
                        )
                    ],
                    isError=True,
                )
            )

    if req.params.name == "get-archetype-overview":
        if compute_archetype_overview is None or db_engine is None:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: archetype overview tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        arch = args.get("archetype_name")
        if not isinstance(arch, str) or not arch.strip():
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Missing required parameter: archetype_name",
                        )
                    ],
                    isError=True,
                )
            )
        try:
            result = compute_archetype_overview(db_engine, arch.strip())
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text=json.dumps(result, default=str),
                        )
                    ],
                )
            )
        except Exception as e:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text=f"Error: {e}",
                        )
                    ],
                    isError=True,
                )
            )

    if req.params.name == "query-database":
        if db_engine is None or execute_select_query is None:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: query tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        sql = args.get("sql")
        lim = args.get("limit", 1000)
        if not isinstance(sql, str) or not sql.strip():
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text", text="Missing required parameter: sql"
                        )
                    ],
                    isError=True,
                )
            )
        try:
            result = execute_select_query(db_engine, sql, lim)
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text", text=json.dumps(result, default=str)
                        )
                    ]
                )
            )
        except Exception as e:
            return types.ServerResult(
                types.CallToolResult(
                    content=[types.TextContent(type="text", text=f"Error: {e}")],
                    isError=True,
                )
            )

    if req.params.name == "get-matchup-winrate":
        if (
            db_engine is None
            or validate_date_range is None
            or compute_matchup_winrate is None
        ):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: matchup tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        fmt = args.get("format_id")
        a1 = args.get("archetype1_name")
        a2 = args.get("archetype2_name")
        s = args.get("start_date")
        e = args.get("end_date")
        if not (fmt and a1 and a2 and s and e):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Missing required parameters: format_id, archetype1_name, archetype2_name, start_date, end_date",
                        )
                    ],
                    isError=True,
                )
            )
        try:
            start, end = validate_date_range(s, e)
            result = compute_matchup_winrate(db_engine, fmt, a1, a2, start, end)
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text", text=json.dumps(result, default=str)
                        )
                    ]
                )
            )
        except Exception as e:
            return types.ServerResult(
                types.CallToolResult(
                    content=[types.TextContent(type="text", text=f"Error: {e}")],
                    isError=True,
                )
            )

    if req.params.name == "list-formats":
        if Format is None or get_session is None:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: list-formats tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        try:
            with get_session() as session:
                formats = session.query(Format).order_by(Format.name).all()

            if not formats:
                result = {"formats": [], "message": "No formats found in database"}
            else:
                format_list = [{"id": row.id, "name": row.name} for row in formats]
                result = {"formats": format_list, "total_count": len(format_list)}

            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text=json.dumps(result, default=str),
                        )
                    ],
                )
            )
        except Exception as e:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text=f"Error: {e}",
                        )
                    ],
                    isError=True,
                )
            )

    # Unknown tool
    return types.ServerResult(
        types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=f"Unknown tool: {req.params.name}",
                )
            ],
            isError=True,
        )
    )


# Register the tool handler
mcp._mcp_server.request_handlers[types.CallToolRequest] = _call_tool_request

# Create the FastAPI app
app = mcp.streamable_http_app()

# Add CORS middleware
try:
    from starlette.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )
except Exception:
    pass


if __name__ == "__main__":
    import uvicorn

    print("Starting MCP server on http://0.0.0.0:8000")
    print("Endpoints:")
    print("  - GET  /mcp (SSE stream)")
    print("  - POST /mcp/messages?sessionId=<id>")
    uvicorn.run("src.chatgpt_app.main:app", host="0.0.0.0", port=8000)
