"""Simple ChatGPT MCP app with a hello world tool."""

from __future__ import annotations

from typing import List

import mcp.types as types
from mcp.server.fastmcp import FastMCP
import json

try:
    from src.analysis.meta import compute_meta_report
    from src.analysis.archetype import (
        compute_archetype_overview,
        compute_archetype_cards,
        compute_archetype_winrate,
    )
    from src.analysis.matchup import compute_matchup_winrate
    from src.analysis.card import search_card as analysis_search_card
    from src.analysis.sources import compute_sources as analysis_compute_sources
    from src.models import Format
    from .utils import engine as db_engine, validate_date_range, get_session
    from .query import execute_select_query
except Exception:
    compute_meta_report = None
    compute_archetype_overview = None
    compute_archetype_cards = None
    compute_archetype_winrate = None
    compute_matchup_winrate = None
    analysis_search_card = None
    analysis_compute_sources = None
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
            description="Find an archetype by name using fuzzy matching and get its archetype_id (UUID) for use in query-database. Returns archetype_id, format_id, format_name, recent 30-day stats, and top 8 key cards. Essential for getting archetype_id before writing custom queries.",
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
            description="""Execute SELECT/CTE SQL queries against the MTG tournament database.

SCHEMA & RELATIONSHIPS:
• tournaments → tournament_entries (via tournament_id)
• tournament_entries → matches (via entry_id/opponent_entry_id)
• tournament_entries → deck_cards (via entry_id)
• tournament_entries → archetypes (via archetype_id)
• tournament_entries → players (via player_id)
• deck_cards → cards (via card_id)
• cards → card_colors (via card_id)
• archetypes → formats (via format_id)

KEY PATTERNS:
1. To find card usage: deck_cards JOIN tournament_entries JOIN tournaments
2. To analyze matchups: matches JOIN tournament_entries (twice for both players)
3. To filter by date/format: Always join through tournaments table
4. result values: 'WIN', 'LOSS', 'DRAW' (uppercase strings)
5. board values: 'MAIN', 'SIDE' (uppercase strings)

LOOKUP STRATEGY:
• Use search-card('card name') to get card_id first
• Use get-archetype-overview('deck name') to get archetype_id
• Use list-formats() to get format_id
• All IDs are 36-char UUID strings

DATE QUERIES:
• Use ranges: t.date >= '2025-01-01' AND t.date < '2025-02-01'
• Never use equality: t.date = '2025-01-01' (won't match)

Do NOT include LIMIT in SQL; it's added automatically.""",
            inputSchema={
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "SELECT or WITH...SELECT query. Example for card in archetype: SELECT COUNT(*) FROM deck_cards dc JOIN tournament_entries te ON dc.entry_id = te.id JOIN tournaments t ON te.tournament_id = t.id WHERE dc.card_id = 'uuid-here' AND te.archetype_id = 'uuid-here' AND t.format_id = 'uuid-here' AND t.date >= '2025-01-01'",
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
            name="get-archetype-cards",
            title="Archetype Cards",
            description="Get top cards in a specific archetype within a date window. Returns decks_playing, total_copies, avg_copies_per_deck, and presence % within the archetype.",
            inputSchema={
                "type": "object",
                "properties": {
                    "format_id": {"type": "string", "description": "Format UUID"},
                    "archetype_name": {
                        "type": "string",
                        "description": "Archetype name (case-insensitive)",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "board": {
                        "type": "string",
                        "description": "Card board: 'MAIN' or 'SIDE' (default MAIN)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max cards (default 20)",
                    },
                },
                "required": ["format_id", "archetype_name", "start_date", "end_date"],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="get-archetype-winrate",
            title="Archetype Winrate",
            description="Compute wins/losses/draws and winrate (excluding draws) for a given archetype_id within a date window.",
            inputSchema={
                "type": "object",
                "properties": {
                    "archetype_id": {
                        "type": "string",
                        "description": "Archetype UUID (fetch via get-archetype-overview)",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
                    },
                    "exclude_mirror": {
                        "type": "boolean",
                        "description": "Exclude mirror matches (default true)",
                    },
                },
                "required": ["archetype_id", "start_date", "end_date"],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="search-card",
            title="Search Card",
            description="Search a card by partial name and get its card_id (UUID) for use in query-database. Essential first step before querying card usage. Returns card_id, name, colors, oracle_id, and whether it's in the local tournament database.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Partial or full card name",
                    }
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="get-sources",
            title="Recent Tournaments (for citations)",
            description="Return up to N recent tournaments (with links) for a format and optional archetype within a date window. For citation only; not ranked by performance.",
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
                    "archetype_name": {
                        "type": "string",
                        "description": "Optional archetype name filter",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max tournaments (default 3, max 10)",
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

    if req.params.name == "get-archetype-cards":
        if (
            compute_archetype_cards is None
            or db_engine is None
            or validate_date_range is None
        ):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: archetype cards tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        fmt = args.get("format_id")
        arch_name = args.get("archetype_name")
        start_str = args.get("start_date")
        end_str = args.get("end_date")
        board = (args.get("board") or "MAIN").upper()
        lim = args.get("limit", 20)
        if not (
            fmt
            and isinstance(arch_name, str)
            and arch_name.strip()
            and start_str
            and end_str
        ):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Missing required parameters: format_id, archetype_name, start_date, end_date",
                        )
                    ],
                    isError=True,
                )
            )
        try:
            start_dt, end_dt = validate_date_range(start_str, end_str)
            if board not in ["MAIN", "SIDE"]:
                return types.ServerResult(
                    types.CallToolResult(
                        content=[
                            types.TextContent(
                                type="text", text="board must be 'MAIN' or 'SIDE'"
                            )
                        ],
                        isError=True,
                    )
                )
            limit_val = lim if isinstance(lim, int) and lim > 0 else 20
            result = compute_archetype_cards(
                db_engine, fmt, arch_name.strip(), start_dt, end_dt, board, limit_val
            )
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

    if req.params.name == "get-archetype-winrate":
        if (
            compute_archetype_winrate is None
            or db_engine is None
            or validate_date_range is None
        ):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: archetype winrate tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        arch_id = args.get("archetype_id")
        start_str = args.get("start_date")
        end_str = args.get("end_date")
        exclude_mirror = args.get("exclude_mirror", True)
        if not (arch_id and start_str and end_str):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Missing required parameters: archetype_id, start_date, end_date",
                        )
                    ],
                    isError=True,
                )
            )
        try:
            start_dt, end_dt = validate_date_range(start_str, end_str)
            result = compute_archetype_winrate(
                db_engine, arch_id, start_dt, end_dt, bool(exclude_mirror)
            )
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

    if req.params.name == "search-card":
        if analysis_search_card is None or db_engine is None:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: search card tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        q = args.get("query")
        if not isinstance(q, str) or not q.strip():
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text", text="Missing required parameter: query"
                        )
                    ],
                    isError=True,
                )
            )
        try:
            result = analysis_search_card(db_engine, q.strip())
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

    if req.params.name == "get-sources":
        if (
            analysis_compute_sources is None
            or db_engine is None
            or validate_date_range is None
        ):
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="Server misconfigured: sources tool unavailable",
                        )
                    ],
                    isError=True,
                )
            )
        args = req.params.arguments or {}
        fmt = args.get("format_id")
        start_str = args.get("start_date")
        end_str = args.get("end_date")
        arch_name = args.get("archetype_name")
        lim = args.get("limit", 3)
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
            try:
                limit_val = int(lim)
            except Exception:
                limit_val = 3
            if limit_val <= 0:
                limit_val = 3
            if limit_val > 10:
                limit_val = 10
            result = analysis_compute_sources(
                db_engine,
                fmt,
                start_dt,
                end_dt,
                arch_name if isinstance(arch_name, str) and arch_name.strip() else None,
                limit_val,
            )
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
