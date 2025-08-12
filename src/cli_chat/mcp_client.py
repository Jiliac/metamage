"""MCP client setup for connecting to MTG tournament analysis server."""

from typing import List
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.tools.base import BaseTool


async def create_mcp_client() -> tuple[List[BaseTool], str]:
    """Create MCP client and return available tools plus format context.

    Returns:
        Tuple of (LangChain-compatible tools, format context string)
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

        # Pre-load format context by calling list_formats tool
        format_context = ""
        try:
            # Find the list_formats tool
            list_formats_tool = next(
                (tool for tool in tools if tool.name == "list_formats"), None
            )
            if list_formats_tool:
                # Call the tool to get format list
                format_result = await list_formats_tool.ainvoke({})
                format_context = f"\n\n## Available Formats Context\n{format_result}"
                print("Pre-loaded format context for LLM")
        except Exception as e:
            print(f"Warning: Could not pre-load format context: {e}")

        return tools, format_context
    except Exception as e:
        print(f"Error connecting to MCP server: {e}")
        print("Make sure the MCP server is running with:")
        print("uv run -m src.mcp_server.server --http")
        raise
