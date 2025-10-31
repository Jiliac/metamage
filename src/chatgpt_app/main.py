"""Simple ChatGPT MCP app with a hello world tool."""

from __future__ import annotations

from typing import List

import mcp.types as types
from mcp.server.fastmcp import FastMCP
import json

try:
    from src.analysis.meta import compute_meta_report
    from src.analysis.archetype import find_archetype_fuzzy
    from .utils import engine as db_engine, validate_date_range
except Exception:
    compute_meta_report = None
    find_archetype_fuzzy = None
    db_engine = None
    validate_date_range = None

# Create the MCP server
mcp = FastMCP(
    name="hello-world-app",
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
            description="Returns archetype presence and winrate (excluding draws) over a date window.",
            inputSchema={
                "type": "object",
                "properties": {
                    "format_id": {"type": "string", "description": "Format UUID"},
                    "start_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max archetypes (default 15, max 20)",
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
            description="Get archetype overview with recent performance and key cards. Uses fuzzy matching to find archetypes by partial name.",
            inputSchema={
                "type": "object",
                "properties": {
                    "archetype_name": {
                        "type": "string",
                        "description": "Name or partial name of the archetype",
                    },
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
        if find_archetype_fuzzy is None or db_engine is None:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: archetype tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        archetype_name = args.get("archetype_name")
        if not archetype_name:
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
            # Use shared analysis function to find archetype
            arch_match = find_archetype_fuzzy(db_engine, archetype_name)

            if not arch_match:
                return types.ServerResult(
                    types.CallToolResult(
                        content=[
                            types.TextContent(
                                type="text",
                                text=json.dumps(
                                    {
                                        "error": f"Archetype '{archetype_name}' not found. Try a different name or check spelling."
                                    }
                                ),
                            )
                        ],
                    )
                )

            # Use the found archetype name for the main query
            found_name = arch_match["name"]

            # Get archetype info with recent performance
            from sqlalchemy import text

            sql = """
                SELECT
                    a.id as archetype_id,
                    a.name as archetype_name,
                    f.name as format_name,
                    f.id as format_id,
                    COUNT(DISTINCT te.id) as recent_entries,
                    COUNT(DISTINCT t.id) as tournaments_played,
                    ROUND(
                        CAST(COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) AS REAL) /
                        CAST((COUNT(CASE WHEN m.result = 'WIN' THEN 1 END) + COUNT(CASE WHEN m.result = 'LOSS' THEN 1 END)) AS REAL) * 100, 1
                    ) as winrate_no_draws
                FROM archetypes a
                JOIN formats f ON a.format_id = f.id
                LEFT JOIN tournament_entries te ON a.id = te.archetype_id
                LEFT JOIN tournaments t ON te.tournament_id = t.id AND t.date >= date('now', '-30 days')
                LEFT JOIN matches m ON te.id = m.entry_id AND m.entry_id < m.opponent_entry_id
                WHERE LOWER(a.name) = LOWER(:archetype_name)
                GROUP BY a.id, a.name, f.name, f.id
            """

            with db_engine.connect() as conn:
                arch_info = (
                    conn.execute(text(sql), {"archetype_name": found_name})
                    .mappings()
                    .first()
                )

            # Get top cards
            cards_sql = """
                SELECT
                    c.name as card_name,
                    COUNT(DISTINCT te.id) as decks_playing,
                    ROUND(AVG(CAST(dc.count AS REAL)), 1) as avg_copies
                FROM deck_cards dc
                JOIN cards c ON dc.card_id = c.id
                JOIN tournament_entries te ON dc.entry_id = te.id
                JOIN tournaments t ON te.tournament_id = t.id
                JOIN archetypes a ON te.archetype_id = a.id
                WHERE LOWER(a.name) = LOWER(:archetype_name)
                AND t.date >= date('now', '-30 days')
                AND dc.board = 'MAIN'
                GROUP BY c.id, c.name
                ORDER BY decks_playing DESC
                LIMIT 8
            """

            with db_engine.connect() as conn:
                cards = conn.execute(
                    text(cards_sql), {"archetype_name": found_name}
                ).fetchall()

            result = {
                "archetype_id": arch_info["archetype_id"],
                "archetype_name": arch_info["archetype_name"],
                "format_id": arch_info["format_id"],
                "format_name": arch_info["format_name"],
                "recent_performance": {
                    "tournament_entries": arch_info["recent_entries"] or 0,
                    "tournaments_played": arch_info["tournaments_played"] or 0,
                    "winrate_percent": arch_info["winrate_no_draws"],
                },
                "key_cards": [
                    {
                        "name": c.card_name,
                        "avg_copies": c.avg_copies,
                        "decks_playing": c.decks_playing,
                    }
                    for c in cards
                ],
            }

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
