#!/usr/bin/env python3
"""
Generate usage statistics for the Metamage bot.

Analyzes chat sessions, tool usage, query complexity, and performance metrics
from the ops database.
"""

import sys
import json
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from src.ops_model.base import get_ops_session_factory
from src.ops_model.chat_models import ChatSession, ChatMessage, ToolCall, ToolResult
from sqlalchemy import func, extract


def main():
    """Generate and display usage statistics."""
    # Load environment variables
    load_dotenv()

    SessionFactory = get_ops_session_factory()
    session = SessionFactory()

    try:
        print("=" * 70)
        print(" " * 20 + "METAMAGE BOT STATISTICS")
        print(" " * 20 + "Usage & Performance Report")
        print("=" * 70)

        # 1. Chat sessions
        print("\n📊 1. CHAT SESSIONS")
        print("-" * 70)
        total_sessions = session.query(ChatSession).count()
        print(f"Total Sessions: {total_sessions:,}")

        sessions_by_source = (
            session.query(ChatSession.source, func.count(ChatSession.id))
            .group_by(ChatSession.source)
            .all()
        )

        print("\nBreakdown by source:")
        for source, count in sorted(
            sessions_by_source, key=lambda x: x[1], reverse=True
        ):
            pct = count / total_sessions * 100
            print(f"  • {(source or 'unknown'):.<15} {count:>4} ({pct:>5.1f}%)")

        # 2. Tool usage
        print("\n\n🔧 2. TOOL USAGE")
        print("-" * 70)
        total_tool_calls = session.query(ToolCall).count()
        print(f"Total Tool Calls: {total_tool_calls:,}")

        # 4. Tool calls per session
        sessions_with_tools = (
            session.query(
                ChatMessage.session_id, func.count(ToolCall.id).label("tool_count")
            )
            .join(ToolCall, ChatMessage.id == ToolCall.message_id)
            .group_by(ChatMessage.session_id)
            .subquery()
        )

        avg_tools = session.query(func.avg(sessions_with_tools.c.tool_count)).scalar()
        print(f"Average Tool Calls per Session: {avg_tools:.2f}")

        most_used = (
            session.query(ToolCall.tool_name, func.count(ToolCall.id).label("count"))
            .group_by(ToolCall.tool_name)
            .order_by(func.count(ToolCall.id).desc())
            .limit(10)
            .all()
        )

        print("\nMost Used Tools:")
        for i, (tool, count) in enumerate(most_used, 1):
            pct = count / total_tool_calls * 100
            print(f"  {i:>2}. {tool:.<35} {count:>5} ({pct:>5.1f}%)")

        # 3. Tool success rate
        print("\n\n✅ 3. TOOL SUCCESS RATE")
        print("-" * 70)
        total_results = session.query(ToolResult).count()
        successful = (
            session.query(ToolResult).filter(ToolResult.success).count()
        )
        success_rate = (successful / total_results * 100) if total_results > 0 else 0

        print(f"Total Tool Executions: {total_results:,}")
        print(f"Successful: {successful:,}")
        print(f"Failed: {total_results - successful:,}")
        print(f"Success Rate: {success_rate:.2f}%")

        # 4. Query complexity
        print("\n\n🔍 4. QUERY COMPLEXITY (query_database tool)")
        print("-" * 70)
        query_calls = (
            session.query(ToolCall).filter(ToolCall.tool_name == "query_database").all()
        )

        simple = medium = complex_q = 0
        for tc in query_calls:
            try:
                params = (
                    tc.input_params
                    if isinstance(tc.input_params, dict)
                    else json.loads(tc.input_params)
                )
                query = params.get("sql", "").upper()

                score = 0
                if "WITH" in query[:10] or " WITH " in query:
                    score += 3
                if " OVER(" in query or " OVER (" in query:
                    score += 2
                score += query.count(" JOIN ")
                if query.count("SELECT") > 1:
                    score += 2
                if " GROUP BY " in query:
                    score += 1

                if score >= 4:
                    complex_q += 1
                elif score >= 2 or query.count("\n") > 5:
                    medium += 1
                else:
                    simple += 1
            except Exception:
                simple += 1

        total_queries = len(query_calls)
        if total_queries > 0:
            print(f"Total Queries Analyzed: {total_queries:,}")
            print("\nComplexity Distribution:")
            print(
                f"  • Simple (no JOINs)..........   {simple:>4} ({simple / total_queries * 100:>5.1f}%)"
            )
            print(
                f"  • Medium (1-2 JOINs).........   {medium:>4} ({medium / total_queries * 100:>5.1f}%)"
            )
            print(
                f"  • Complex (3+ JOINs, CTEs)...   {complex_q:>4} ({complex_q / total_queries * 100:>5.1f}%)"
            )
        else:
            print("No query_database tool calls found.")

        # 5. Sessions over time
        print("\n\n📅 5. SESSIONS OVER TIME")
        print("-" * 70)
        by_day = (
            session.query(
                func.date(ChatSession.created_at).label("date"),
                func.count(ChatSession.id).label("count"),
            )
            .group_by(func.date(ChatSession.created_at))
            .order_by(func.date(ChatSession.created_at).desc())
            .limit(10)
            .all()
        )

        print("Recent Activity (Last 10 days):")
        for date, count in by_day:
            bar = "█" * (count // 2)  # Visual bar
            print(f"  {date}  {count:>3} {bar}")

        # 6. Peak hours
        print("\n\n⏰ 6. PEAK USAGE HOURS (UTC)")
        print("-" * 70)
        by_hour = (
            session.query(
                extract("hour", ChatSession.created_at).label("hour"),
                func.count(ChatSession.id).label("count"),
            )
            .group_by(extract("hour", ChatSession.created_at))
            .order_by(func.count(ChatSession.id).desc())
            .limit(5)
            .all()
        )

        print("Top 5 Hours:")
        for hour, count in by_hour:
            print(
                f"  {int(hour):02d}:00-{int(hour) + 1:02d}:00 ... {count:>3} sessions"
            )

        # 7. Response time
        print("\n\n⚡ 7. RESPONSE TIME")
        print("-" * 70)
        sessions_list = (
            session.query(ChatSession)
            .filter(
                ChatSession.created_at.isnot(None), ChatSession.updated_at.isnot(None)
            )
            .all()
        )

        durations = [
            (s.updated_at - s.created_at).total_seconds()
            for s in sessions_list
            if (s.updated_at - s.created_at).total_seconds() > 0
        ]

        if durations:
            avg = sum(durations) / len(durations)
            median = sorted(durations)[len(durations) // 2]

            print(f"Average Response Time: {avg:.1f}s ({avg / 60:.1f} min)")
            print(f"Median Response Time:  {median:.1f}s ({median / 60:.1f} min)")

            u30 = sum(1 for d in durations if d < 30)
            u60 = sum(1 for d in durations if 30 <= d < 60)
            u300 = sum(1 for d in durations if 60 <= d < 300)
            o300 = sum(1 for d in durations if d >= 300)

            print("\nDistribution:")
            print(
                f"  • < 30 sec ...........   {u30:>4} ({u30 / len(durations) * 100:>5.1f}%)"
            )
            print(
                f"  • 30-60 sec ..........   {u60:>4} ({u60 / len(durations) * 100:>5.1f}%)"
            )
            print(
                f"  • 1-5 min ............   {u300:>4} ({u300 / len(durations) * 100:>5.1f}%)"
            )
            print(
                f"  • > 5 min ............   {o300:>4} ({o300 / len(durations) * 100:>5.1f}%)"
            )
        else:
            print("No session duration data available.")

        print("\n" + "=" * 70)
        print(" " * 25 + "End of Report")
        print("=" * 70)

    finally:
        session.close()


if __name__ == "__main__":
    main()
