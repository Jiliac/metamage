"""MCP client setup for connecting to MTG tournament analysis server."""

from typing import List
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.tools.base import BaseTool


async def create_mcp_client() -> List[BaseTool]:
    """Create MCP client and return available tools.

    Returns:
        List of LangChain-compatible tools from the MCP server
    """
    # Create MCP client configuration for HTTP transport
    client = MultiServerMCPClient(
        {"mtg": {"url": "http://localhost:9000/mcp", "transport": "streamable_http"}}
    )

    try:
        # Get tools from the MCP server
        tools = await client.get_tools()
        print(f"Successfully connected to MCP server. Available tools: {len(tools)}")
        # for tool in tools:
        #     print(f"  - {tool.name}: {tool.description}")
        return tools
    except Exception as e:
        print(f"Error connecting to MCP server: {e}")
        print("Make sure the MCP server is running with:")
        print("uv run -m src.mcp_server.server --http")
        raise
