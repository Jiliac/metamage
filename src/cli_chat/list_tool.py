#!/usr/bin/env python3
"""Simple tool to list available MCP tools without verbose descriptions."""

import asyncio
import inspect
from .mcp_client import create_mcp_client


async def list_tools_and_resources():
    """List all available MCP tools and resources with names and basic argument info."""
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        # Create MCP client configuration for HTTP transport
        client = MultiServerMCPClient(
            {
                "mtg": {
                    "url": "http://localhost:9000/mcp",
                    "transport": "streamable_http",
                }
            }
        )

        # Get tools
        tools = await client.get_tools()
        print(f"\nAvailable MCP Tools ({len(tools)}):")
        print("=" * 50)

        for tool in tools:
            # Get tool name
            tool_name = tool.name

            # Try to get arguments from the tool's schema or run method
            args_info = ""
            if hasattr(tool, "args_schema") and tool.args_schema:
                # Get field names from pydantic model
                if hasattr(tool.args_schema, "__fields__"):
                    fields = list(tool.args_schema.__fields__.keys())
                    args_info = f"({', '.join(fields)})"
                elif hasattr(tool.args_schema, "model_fields"):
                    fields = list(tool.args_schema.model_fields.keys())
                    args_info = f"({', '.join(fields)})"
            elif hasattr(tool, "_run"):
                # Try to get signature from _run method
                try:
                    sig = inspect.signature(tool._run)
                    params = [
                        name
                        for name, param in sig.parameters.items()
                        if name not in ["self", "run_manager"]
                    ]
                    if params:
                        args_info = f"({', '.join(params)})"
                except Exception:
                    pass

            print(f"• {tool_name}{args_info}")

        # Get resources
        try:
            resources = await client.get_resources(server_name="mtg")
            print(f"\nAvailable MCP Resources ({len(resources)}):")
            print("=" * 50)

            for resource in resources:
                print(f"• {resource.uri}")
                if hasattr(resource, "name") and resource.name:
                    print(f"  Name: {resource.name}")
                if hasattr(resource, "description") and resource.description:
                    # Just show first line of description to keep it brief
                    desc_line = resource.description.split("\n")[0]
                    if len(desc_line) > 80:
                        desc_line = desc_line[:77] + "..."
                    print(f"  Description: {desc_line}")
        except Exception as e:
            print(f"\nCould not list resources: {e}")

        print("=" * 50)

    except Exception as e:
        print(f"Error listing tools and resources: {e}")
        return 1

    return 0


async def main():
    """Main entry point."""
    return await list_tools_and_resources()


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        exit(exit_code)
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        exit(0)
