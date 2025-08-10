#!/usr/bin/env python3
"""
CLI Agent for MTG Tournament database using LiteLLM with MCP tools.
"""

import os
import sys
import argparse
import asyncio
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional

import litellm
from litellm import completion

# MCP client for direct tool access
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class MTGTournamentAgent:
    """CLI Agent for interacting with MTG Tournament database via LiteLLM with MCP tools."""

    def __init__(self, config_path: Optional[str] = None):
        """Initialize the agent with LiteLLM and MCP configuration."""
        if config_path is None:
            config_path = Path(__file__).parent / "config.yaml"

        self.config_path = config_path
        self.model = "claude-3-5-sonnet-20241022"
        self.mcp_session = None
        self.available_tools = []

        # Set up LiteLLM
        litellm.set_verbose = False

        # Ensure required environment variables
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")

    async def _connect_mcp(self):
        """Connect to the MCP server and get available tools."""
        if self.mcp_session is not None:
            return

        # Get project root directory
        project_root = Path(__file__).parent.parent

        # Set up server parameters
        server_params = StdioServerParameters(
            command="python",
            args=["-m", "src.mcp_server.server", "--stdio"],
            env=dict(os.environ),  # Pass through environment variables
            cwd=str(project_root),  # Set working directory to project root
        )

        try:
            # Connect to MCP server
            async with stdio_client(server_params) as (read, write):
                self.mcp_session = ClientSession(read, write)
                await self.mcp_session.initialize()

                # Get available tools
                tools_response = await self.mcp_session.list_tools()
                self.available_tools = tools_response.tools

                print(
                    f"🔡 Connected to MCP server with {len(self.available_tools)} tools"
                )

        except Exception as e:
            print(f"❌ Failed to connect to MCP server: {e}")
            raise

    async def _call_mcp_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call an MCP tool and return the result."""
        if self.mcp_session is None:
            await self._connect_mcp()

        try:
            result = await self.mcp_session.call_tool(tool_name, arguments)
            if result.content and len(result.content) > 0:
                # Handle different content types
                content = result.content[0]
                if hasattr(content, "text"):
                    return content.text
                else:
                    return str(content)
            return None
        except Exception as e:
            return f"Tool error: {str(e)}"

    async def query(self, user_query: str, stream: bool = False) -> str:
        """Execute a query using a combination of LiteLLM reasoning and MCP tool calls."""

        # Connect to MCP server
        await self._connect_mcp()

        # First, use LiteLLM to analyze the query and determine what tools to call
        planning_prompt = f"""You are an expert MTG tournament data analyst. Analyze this query and determine what database operations are needed:

Query: {user_query}

Available tools:
1. query_database(sql, limit) - Execute SELECT queries against tournament database
2. get_archetype_winrate(archetype_id, start_date, end_date, exclude_mirror) - Get winrate stats

The database has tables: tournaments, archetypes, matches, formats

First, ALWAYS start by checking the actual date range available in the database before making any assumptions about dates.

Respond with a JSON plan specifying exactly what tool calls to make. Be specific about SQL queries and parameters.

Example response format:
{{
  "steps": [
    {{
      "tool": "query_database",
      "purpose": "Check date range in database",
      "arguments": {{"sql": "SELECT MIN(date) as earliest, MAX(date) as latest FROM tournaments WHERE format = 'Modern'", "limit": 10}}
    }}
  ]
}}"""

        try:
            # Get execution plan from LiteLLM
            plan_response = completion(
                model=self.model,
                messages=[{"role": "user", "content": planning_prompt}],
            )

            plan_text = plan_response.choices[0].message.content.strip()

            # Extract JSON from response
            json_match = re.search(r"\{.*\}", plan_text, re.DOTALL)
            if json_match:
                plan = json.loads(json_match.group())
            else:
                # Fallback: direct database exploration
                plan = {
                    "steps": [
                        {
                            "tool": "query_database",
                            "purpose": "Explore database",
                            "arguments": {
                                "sql": "SELECT name FROM sqlite_master WHERE type='table'",
                                "limit": 10,
                            },
                        }
                    ]
                }

            # Execute the plan
            results = []
            for step in plan.get("steps", []):
                tool_name = step["tool"]
                arguments = step["arguments"]
                purpose = step.get("purpose", "")

                print(f"🔧 {purpose}: {tool_name}({arguments})")
                result = await self._call_mcp_tool(tool_name, arguments)
                results.append({"purpose": purpose, "result": result})

            # Now use LiteLLM to analyze the results and provide final answer
            analysis_prompt = f"""Based on the database query results, provide a comprehensive answer to the user's question.

Original query: {user_query}

Database results:
{json.dumps(results, indent=2)}

IMPORTANT: Only use actual data from the database results above. Do not make up or hallucinate any data. If the query asked for dates that don't exist in the database, explain what date range is actually available and provide analysis for that range instead.

Provide a clear, well-formatted response with specific data and insights."""

            if stream:
                return await self._stream_completion(
                    [{"role": "user", "content": analysis_prompt}]
                )
            else:
                final_response = completion(
                    model=self.model,
                    messages=[{"role": "user", "content": analysis_prompt}],
                )
                return final_response.choices[0].message.content

        except Exception as e:
            return f"Error: {str(e)}"

    async def _stream_completion(self, messages: List[Dict[str, str]]) -> str:
        """Stream the completion response."""
        full_response = ""

        try:
            response = completion(
                model=self.model,
                messages=messages,
                stream=True,
            )

            for chunk in response:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    print(content, end="", flush=True)
                    full_response += content

            print()  # Final newline
            return full_response

        except Exception as e:
            error_msg = f"Streaming error: {str(e)}"
            print(error_msg)
            return error_msg


async def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(
        description="MTG Tournament Database CLI Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python agent.py "Find the best Modern deck by winrate since 2024-01-01"
  python agent.py "What are the top 5 Modern archetypes by match count?"
  python agent.py --stream "Compare Burn vs Tron winrates in 2024"
  
Environment Variables:
  ANTHROPIC_API_KEY - Required for Claude API access
  TOURNAMENT_DB_PATH - Optional custom database path
        """,
    )

    parser.add_argument(
        "query", help="Natural language query about MTG tournament data"
    )
    parser.add_argument(
        "--stream", action="store_true", help="Stream the response in real-time"
    )
    parser.add_argument("--config", help="Path to LiteLLM configuration file")

    args = parser.parse_args()

    try:
        agent = MTGTournamentAgent(config_path=args.config)

        print(f"🧠 MTG Tournament Agent")
        print(f"📊 Query: {args.query}")
        print("─" * 60)

        result = await agent.query(args.query, stream=args.stream)

        if not args.stream:
            print(result)

    except KeyboardInterrupt:
        print("\n\n🛑 Query interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
