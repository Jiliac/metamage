#!/usr/bin/env python3
"""
CLI Agent for MTG Tournament database using LiteLLM with MCP tools.
"""

import os
import sys
import argparse
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional

import litellm
from litellm import completion


class MTGTournamentAgent:
    """CLI Agent for interacting with MTG Tournament database via LiteLLM MCP."""

    def __init__(self, config_path: Optional[str] = None):
        """Initialize the agent with LiteLLM configuration."""
        if config_path is None:
            config_path = Path(__file__).parent / "config.yaml"

        self.config_path = config_path
        self.model = "claude-3-5-sonnet-20241022"

        # Set up LiteLLM
        litellm.set_verbose = False

        # Ensure required environment variables
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")

    async def query(self, user_query: str, stream: bool = False) -> str:
        """Execute a query using the LiteLLM agent with MCP tools."""

        system_message = """You are an expert MTG tournament data analyst with access to a comprehensive tournament database.

Available tools:
1. query_database(sql, limit) - Execute SELECT-only queries against the tournament database
2. get_archetype_winrate(archetype_id, start_date, end_date, exclude_mirror) - Get detailed winrate statistics

The database contains:
- tournaments: Modern format tournament data with dates, names, locations
- archetypes: Modern deck archetypes (Burn, Tron, Jund, etc.)  
- matches: Individual match results with archetypes and outcomes
- formats: Format information

Always provide complete, well-formatted responses. When analyzing data:
1. First explore the database structure if needed
2. Find relevant data using appropriate queries
3. Calculate and present clear statistics
4. Explain your findings in context

Be thorough and provide actionable insights."""

        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_query},
        ]

        try:
            if stream:
                return await self._stream_completion(messages)
            else:
                response = completion(
                    model=self.model,
                    messages=messages,
                    tools="auto",  # Enable MCP tools
                    tool_choice="auto",
                )
                return response.choices[0].message.content

        except Exception as e:
            return f"Error: {str(e)}"

    async def _stream_completion(self, messages: List[Dict[str, str]]) -> str:
        """Stream the completion response."""
        full_response = ""

        try:
            response = completion(
                model=self.model,
                messages=messages,
                tools="auto",
                tool_choice="auto",
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
