import argparse

from .mcp import mcp


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MTG Tournament MCP Server")
    parser.add_argument(
        "--stdio",
        action="store_true",
        help="Run the MCP server over stdio transport (default for Claude Desktop).",
    )
    parser.add_argument(
        "--http",
        action="store_true",
        help="Run the MCP server over HTTP transport.",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host for HTTP server (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9000,
        help="Port for HTTP server (default: 9000).",
    )
    args = parser.parse_args()

    if args.http:
        mcp.run(transport="http", host=args.host, port=args.port)
    else:
        # Default to stdio for Claude Desktop compatibility
        mcp.run(transport="stdio")
