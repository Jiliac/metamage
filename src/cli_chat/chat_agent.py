#!/usr/bin/env python3
"""Simple CLI chat agent for MTG tournament analysis using Claude Sonnet + MCP."""

import asyncio
import os

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from .mcp_client import create_mcp_client
from .system_prompt import get_metamage_system_prompt


class MTGChatAgent:
    """CLI chat agent for MTG tournament analysis."""

    def __init__(self):
        self.agent = None
        self.conversation_history = []

    async def setup(self):
        """Initialize the agent with MCP tools and Claude Sonnet."""
        print("🔧 Setting up MTG Tournament Analysis Chat Agent...")

        # Check for API key
        if not os.getenv("OPENAI_API_KEY"):
            print("❌ Error: OPENAI_API_KEY environment variable not set")
            print("Please set your OpenAI API key:")
            print("export OPENAI_API_KEY=your_api_key_here")
            return False

        try:
            # Create MCP client and get tools
            print("📡 Connecting to MCP server...")
            tools, format_context = await create_mcp_client()

            # Create GPT-5 LLM
            print("🧠 Initializing GPT-5...")
            llm = ChatOpenAI(
                model="gpt-5",
                temperature=0.1,  # Low temperature for consistent analysis
                max_tokens=4096,
            )

            # Create ReAct agent with MCP tools
            print("🤖 Creating ReAct agent...")
            system_prompt = get_metamage_system_prompt() + format_context
            self.agent = create_react_agent(llm, tools, prompt=system_prompt)

            print("✅ Agent setup complete!")
            return True

        except Exception as e:
            print(f"❌ Error setting up agent: {e}")
            return False

    async def chat_loop(self):
        """Main chat loop for interacting with the agent."""
        print("\n" + "=" * 50)
        print("🃏 MTG Tournament Analysis Chat")
        print("=" * 50)
        print("Ask questions about MTG tournament data!")
        print("Commands: /help, /clear, /quit")
        print("Example: 'What's the best Modern deck since June 2025?'")
        print("=" * 50)

        while True:
            try:
                # Get user input
                user_input = input("\n💬 You: ").strip()

                if not user_input:
                    continue

                # Handle special commands
                if user_input.lower() in ["/quit", "/exit"]:
                    print("👋 Goodbye!")
                    break
                elif user_input.lower() == "/help":
                    self.show_help()
                    continue
                elif user_input.lower() == "/clear":
                    self.conversation_history.clear()
                    print("🧹 Conversation history cleared.")
                    continue

                # Process query with agent
                print("🤔 Analyzing...")
                response = await self.agent.ainvoke(
                    {"messages": [("user", user_input)]}
                )

                # Extract and display response
                assistant_message = response["messages"][-1].content
                print(f"\n🤖 Assistant: {assistant_message}")

                # Store in history
                self.conversation_history.append((user_input, assistant_message))

            except KeyboardInterrupt:
                print("\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"\n❌ Error: {e}")
                print("Please try again or type /quit to exit.")

    def show_help(self):
        """Display help information."""
        print("\n" + "=" * 50)
        print("📚 Help - Available Commands")
        print("=" * 50)
        print("/help     - Show this help message")
        print("/clear    - Clear conversation history")
        print("/quit     - Exit the chat")
        print("\n📊 Example Queries:")
        print("• What's the best Modern deck by winrate since 2025-06-01?")
        print("• Show me the meta report for Modern in the last 30 days")
        print("• What's the winrate of Boros Energy vs Zoo?")
        print("• Get card presence for Modern since July 2025")
        print("• Show tournament results for Pioneer this month")
        print("=" * 50)


async def main():
    """Main entry point for the CLI chat agent."""
    agent = MTGChatAgent()

    # Setup agent
    if not await agent.setup():
        return 1

    # Start chat loop
    await agent.chat_loop()
    return 0


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        exit(exit_code)
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        exit(0)
