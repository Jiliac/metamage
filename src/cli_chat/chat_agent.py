#!/usr/bin/env python3
"""Simple CLI chat agent for MTG tournament analysis using Claude Sonnet + MCP."""

import argparse
import asyncio
import os

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_xai import ChatXAI
from langgraph.prebuilt import create_react_agent

from .mcp_client import create_mcp_client
from .system_prompt import get_metamage_system_prompt
from .chat_logger import ChatLogger


load_dotenv()


class MTGChatAgent:
    """CLI chat agent for MTG tournament analysis."""

    def __init__(self, provider="claude"):
        self.agent = None
        self.conversation_history = []
        self.provider = provider
        self.logger = ChatLogger()
        self.session_id = None

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

            # Create LLM based on provider
            if self.provider == "claude":
                print("🧠 Initializing Claude Sonnet...")
                llm = ChatAnthropic(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                )
            elif self.provider == "opus":
                print("🧠 Initializing Claude Opus...")
                llm = ChatAnthropic(
                    model="claude-opus-4-1-20250805",
                    max_tokens=4096,
                )
            elif self.provider == "xai":
                print("🧠 Initializing xAI Grok...")
                llm = ChatXAI(
                    model="grok-2-1212",
                    max_tokens=4096,
                )
            elif self.provider == "gpt5":
                print("🧠 Initializing OpenAI GPT-5...")
                llm = ChatOpenAI(
                    model="gpt-5",
                    max_tokens=4096,
                )
            else:
                print(f"❌ Error: Unknown provider '{self.provider}'")
                return False

            # Create ReAct agent with MCP tools
            print("🤖 Creating ReAct agent...")
            system_prompt = get_metamage_system_prompt() + format_context
            self.agent = create_react_agent(llm, tools, prompt=system_prompt)

            print("✅ Agent setup complete!")

            # Create chat session for logging
            self.session_id = self.logger.create_session(self.provider)
            return True

        except Exception as e:
            print(f"❌ Error setting up agent: {e}")
            return False

    async def stream_agent(self, messages):
        """Stream the agent execution and return final assistant message.

        This was refactored out of chat_loop to allow future growth.
        """
        assistant_message = ""
        current_message_id = None  # Track current agent message for tool call linking

        async for event in self.agent.astream(
            {"messages": messages}, config={"recursion_limit": 50}
        ):
            # Handle different types of events
            if "agent" in event:
                # Agent is thinking/responding
                agent_messages = event["agent"].get("messages", [])
                if agent_messages:
                    latest_message = agent_messages[-1]
                    if hasattr(latest_message, "content") and latest_message.content:
                        content = latest_message.content

                        # Log agent thought and get message ID for tool call linking
                        if self.session_id:
                            current_message_id = self.logger.log_agent_thought(
                                self.session_id, str(content)
                            )

                        # Parse and log tool calls if present
                        if hasattr(latest_message.content, "__iter__"):
                            for item in latest_message.content:
                                if hasattr(item, "type") and item.type == "tool_use":
                                    if current_message_id:
                                        self.logger.log_tool_call(
                                            current_message_id,
                                            item.name,
                                            item.input,
                                            item.id,
                                        )

                        # Show all agent thoughts, save final response
                        print(f"💭 Agent: {content}")
                        assistant_message = content
                    else:
                        print("Agent with no content ???")

            elif "tools" in event:
                # Agent is calling tools
                tool_messages = event["tools"].get("messages", [])
                for tool_msg in tool_messages:
                    print(f"📊 Tool Result: {tool_msg}")

                    # Log tool results
                    if hasattr(tool_msg, "tool_call_id") and self.session_id:
                        tool_call_id = self.logger.find_tool_call_by_call_id(
                            tool_msg.tool_call_id
                        )
                        if tool_call_id:
                            self.logger.log_tool_result(
                                tool_call_id,
                                str(tool_msg.content)
                                if hasattr(tool_msg, "content")
                                else str(tool_msg),
                                success=True,
                            )

            else:
                # Handle any other event types we discover
                for key, value in event.items():
                    if key not in ["agent", "tools"]:
                        print(f"❓ Unknown event '{key}': {value}")

        return assistant_message

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
                    # Show session stats before exiting
                    if self.session_id:
                        stats = self.logger.get_session_stats(self.session_id)
                        print(f"\n📊 Session Stats: {stats}")
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

                # Log user message
                if self.session_id:
                    self.logger.log_user_message(self.session_id, user_input)

                # Build full message history
                messages = []
                for prev_user, prev_assistant in self.conversation_history:
                    messages.append(("user", prev_user))
                    messages.append(("assistant", prev_assistant))
                messages.append(("user", user_input))

                assistant_message = await self.stream_agent(messages)

                # Display final response if we got one
                if assistant_message:
                    print(f"\n🤖 Assistant: {assistant_message}")

                    # Log final response
                    if self.session_id:
                        self.logger.log_final_response(
                            self.session_id, assistant_message
                        )
                else:
                    print("\n🤖 Assistant: [No final response captured]")

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
