"""MCP client setup for connecting to MTG tournament analysis server."""

import os
import sys
from typing import List
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.tools.base import BaseTool


async def create_mcp_client() -> List[BaseTool]:
    """Create MCP client and return available tools.

    Returns:
        List of LangChain-compatible tools from the MCP server
    """
    # Get the absolute path to the MCP server
    current_dir = os.path.dirname(os.path.abspath(__file__))
    server_path = os.path.join(current_dir, "..", "mcp_server", "server.py")
    server_path = os.path.abspath(server_path)

    if not os.path.exists(server_path):
        raise FileNotFoundError(f"MCP server not found at: {server_path}")

    # Create MCP client configuration
    client = MultiServerMCPClient(
        {
            "mtg": {
                "command": sys.executable,  # Use current Python interpreter
                "args": [server_path, "--stdio"],
                "transport": "stdio",
            }
        }
    )

    try:
        # Get tools from the MCP server
        tools = await client.get_tools()
        print(f"Successfully connected to MCP server. Available tools: {len(tools)}")
        for tool in tools:
            print(f"  - {tool.name}: {tool.description}")
        return tools
    except Exception as e:
        print(f"Error connecting to MCP server: {e}")
        raise
