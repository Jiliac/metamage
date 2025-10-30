"""ChatGPT MCP app for MTG Tournament Analysis."""

from __future__ import annotations

from typing import List

import mcp.types as types
from mcp.server.fastmcp import FastMCP

# Import the existing MCP server instance and its tools
from ..mcp_server.mcp import mcp as mtg_mcp

# Create the ChatGPT-compatible MCP server
mcp = FastMCP(
    name="mtg-tournament-app",
    stateless_http=True,
)


@mcp._mcp_server.list_tools()
async def _list_tools() -> List[types.Tool]:
    """List available tools for ChatGPT."""
    return [
        types.Tool(
            name="get-meta-report",
            title="Get Meta Report",
            description="Get a meta report showing archetype presence % and winrates for a format in a date range",
            inputSchema={
                "type": "object",
                "properties": {
                    "format_id": {
                        "type": "string",
                        "description": "Format UUID (e.g., Modern: '402d2a82-3ba6-4369-badf-a51f3eff4375')",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date (YYYY-MM-DD)",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date (YYYY-MM-DD)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of archetypes to return (default: 20)",
                        "default": 20,
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
            title="Get Archetype Overview",
            description="Get detailed overview of an archetype including recent performance and key cards",
            inputSchema={
                "type": "object",
                "properties": {
                    "archetype_name": {
                        "type": "string",
                        "description": "Name of the archetype (e.g., 'Mono Black Coffers', 'Rakdos Scam')",
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
        types.Tool(
            name="get-matchup-winrate",
            title="Get Matchup Winrate",
            description="Get head-to-head winrate between two archetypes in a date range",
            inputSchema={
                "type": "object",
                "properties": {
                    "format_id": {
                        "type": "string",
                        "description": "Format UUID",
                    },
                    "archetype1_name": {
                        "type": "string",
                        "description": "First archetype name",
                    },
                    "archetype2_name": {
                        "type": "string",
                        "description": "Second archetype name",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date (YYYY-MM-DD)",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date (YYYY-MM-DD)",
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
            name="get-card-presence",
            title="Get Card Presence",
            description="Get top cards by presence % in a format during a date range",
            inputSchema={
                "type": "object",
                "properties": {
                    "format_id": {
                        "type": "string",
                        "description": "Format UUID",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date (YYYY-MM-DD)",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date (YYYY-MM-DD)",
                    },
                    "board": {
                        "type": "string",
                        "enum": ["MAIN", "SIDE"],
                        "description": "Deck board to analyze (MAIN or SIDE)",
                    },
                    "exclude_lands": {
                        "type": "boolean",
                        "description": "Exclude lands from results",
                        "default": False,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of cards to return",
                        "default": 50,
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
            name="search-card",
            title="Search Card",
            description="Search for a Magic card by name (supports partial/fuzzy matching)",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Card name or partial name to search for",
                    },
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
            name="query-database",
            title="Query Database",
            description="Run SELECT-only SQL queries against the MTG tournament database",
            inputSchema={
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "SQL SELECT query to execute",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return",
                        "default": 100,
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
    ]


async def _call_tool_request(req: types.CallToolRequest) -> types.ServerResult:
    """Handle tool calls by delegating to the underlying MCP server."""
    try:
        # Map ChatGPT-style tool names (kebab-case) to MCP tool names (snake_case)
        tool_name_map = {
            "get-meta-report": "get_meta_report",
            "get-archetype-overview": "get_archetype_overview",
            "get-matchup-winrate": "get_matchup_winrate",
            "get-card-presence": "get_card_presence",
            "search-card": "search_card",
            "query-database": "query_database",
        }

        mcp_tool_name = tool_name_map.get(req.params.name)

        if not mcp_tool_name:
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

        # Create a new request with the mapped tool name
        mapped_req = types.CallToolRequest(
            params=types.CallToolRequestParams(
                name=mcp_tool_name,
                arguments=req.params.arguments,
            )
        )

        # Call the underlying MCP server's tool handler
        result = await mtg_mcp._mcp_server.request_handlers[types.CallToolRequest](
            mapped_req
        )

        return result

    except Exception as e:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Error executing tool: {str(e)}",
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

    print("Starting MTG Tournament ChatGPT MCP server on http://0.0.0.0:8000")
    print("Endpoints:")
    print("  - GET  /mcp (SSE stream)")
    print("  - POST /mcp/messages?sessionId=<id>")
    print("\nFormat IDs:")
    print("  - Modern:   402d2a82-3ba6-4369-badf-a51f3eff4375")
    print("  - Legacy:   0f68f9f5-460d-4111-94df-965cf7e4d28c")
    print("  - Pauper:   cbf69202-6dc7-4861-849e-859d116e7182")
    print("  - Standard: ceff9123-427e-4099-810a-39f57884ec4e")
    print("  - Pioneer:  123dda9e-b157-4bbf-a990-310565cbef7c")
    print("  - Vintage:  dcf29968-f908-4d2e-90a6-4f158bc767be")
    uvicorn.run("src.chatgpt_app.main:app", host="0.0.0.0", port=8000, reload=True)
