#!/usr/bin/env python3
"""Simple CLI chat agent for MTG tournament analysis using Claude Sonnet + MCP."""

import argparse
import asyncio
import os

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_xai import ChatXAI
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from .mcp_client import create_mcp_client
from .system_prompt import get_metamage_system_prompt


load_dotenv()


class MTGChatAgent:
    """CLI chat agent for MTG tournament analysis."""

    def __init__(self, provider="claude"):
        self.llm = None
        self.tools = None
        self.conversation_history = []
        self.provider = provider

    async def setup(self):
        """Initialize the agent with MCP tools and selected LLM provider."""
        print(
            f"🔧 Setting up MTG Tournament Analysis Chat Agent with {self.provider.upper()}..."
        )

        # Check for API key based on provider
        if self.provider == "claude" or self.provider == "opus":
            if not os.getenv("ANTHROPIC_API_KEY"):
                print("❌ Error: ANTHROPIC_API_KEY environment variable not set")
                print("Please set your Anthropic API key:")
                print("export ANTHROPIC_API_KEY=your_api_key_here")
                return False
        elif self.provider == "xai":
            if not os.getenv("XAI_API_KEY"):
                print("❌ Error: XAI_API_KEY environment variable not set")
                print("Please set your xAI API key:")
                print("export XAI_API_KEY=your_api_key_here")
                return False
        elif self.provider == "gpt5":
            if not os.getenv("OPENAI_API_KEY"):
                print("❌ Error: OPENAI_API_KEY environment variable not set")
                print("Please set your OpenAI API key:")
                print("export OPENAI_API_KEY=your_api_key_here")
                return False

        try:
            # Create MCP client and get tools
            print("📡 Connecting to MCP server...")
            tools, format_context = await create_mcp_client()
            self.tools = tools

            # Create LLM based on provider
            if self.provider == "claude":
                print("🧠 Initializing Claude Sonnet...")
                base_llm = ChatAnthropic(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                )
            elif self.provider == "opus":
                print("🧠 Initializing Claude Opus...")
                base_llm = ChatAnthropic(
                    model="claude-opus-4-1-20250805",
                    max_tokens=4096,
                )
            elif self.provider == "xai":
                print("🧠 Initializing xAI Grok...")
                base_llm = ChatXAI(
                    model="grok-2-1212",
                    max_tokens=4096,
                )
            elif self.provider == "gpt5":
                print("🧠 Initializing OpenAI GPT-5...")
                base_llm = ChatOpenAI(
                    model="gpt-5",
                    max_tokens=4096,
                )
            else:
                print(f"❌ Error: Unknown provider '{self.provider}'")
                return False

            # Bind tools to LLM directly
            print("🔧 Binding tools to LLM...")
            self.llm = base_llm.bind_tools(tools)

            # Store system prompt with format context
            self.system_prompt = get_metamage_system_prompt() + format_context

            print("✅ LLM setup complete!")
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

                # Process query with LLM directly
                print("🤔 Analyzing...")

                # Build full message history
                messages = [HumanMessage(content=self.system_prompt)]
                for prev_user, prev_assistant in self.conversation_history:
                    messages.append(HumanMessage(content=prev_user))
                    messages.append(AIMessage(content=prev_assistant))
                messages.append(HumanMessage(content=user_input))

                # Manual tool calling loop
                assistant_message = await self._run_tool_calling_loop(messages)

                # Display final response
                print(f"\n🤖 Assistant: {assistant_message}")

                # Store in history
                self.conversation_history.append((user_input, assistant_message))

            except KeyboardInterrupt:
                print("\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"\n❌ Error: {e}")
                print("Please try again or type /quit to exit.")

    async def _run_tool_calling_loop(self, messages):
        """Run manual tool calling loop with detailed logging."""
        max_iterations = 10
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            print(f"\n🔄 Iteration {iteration}")

            # Call LLM
            print("💭 LLM thinking...")
            response = await self.llm.ainvoke(messages)

            # Show LLM response
            if response.content:
                print(f"🧠 LLM Response: {response.content}")

            # Check for tool calls
            if not response.tool_calls:
                print("✅ No more tool calls - conversation complete")
                return response.content

            # Execute tool calls
            messages.append(response)  # Add LLM response to history

            for tool_call in response.tool_calls:
                print(f"\n🔧 Tool Call: {tool_call['name']}")
                print(f"   Args: {tool_call['args']}")

                # Find and execute the tool
                tool_result = None
                for tool in self.tools:
                    if tool.name == tool_call["name"]:
                        try:
                            tool_result = await tool.ainvoke(tool_call["args"])
                            print(f"📊 Tool Result: {tool_result}")
                            break
                        except Exception as e:
                            tool_result = f"Error: {e}"
                            print(f"❌ Tool Error: {e}")
                            break

                if tool_result is None:
                    tool_result = f"Tool '{tool_call['name']}' not found"
                    print(f"❌ {tool_result}")

                # Add tool result to message history
                messages.append(
                    ToolMessage(content=str(tool_result), tool_call_id=tool_call["id"])
                )

        print(f"\n⚠️ Reached max iterations ({max_iterations})")
        return "I've reached the maximum number of reasoning steps. Please try a simpler question."

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
    parser = argparse.ArgumentParser(description="MTG Tournament Analysis Chat Agent")
    parser.add_argument(
        "--provider",
        choices=["claude", "xai", "opus", "gpt5"],
        default="claude",
        help="LLM provider to use (default: claude)",
    )
    args = parser.parse_args()

    agent = MTGChatAgent(provider=args.provider)

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
