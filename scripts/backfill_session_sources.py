#!/usr/bin/env python3
"""
Backfill the source field for chat sessions that are currently NULL.

All unknown sessions are from before Sept 30, 2025 (when source tracking was fully implemented).

Strategy:
1. Sessions with many messages (>10) → cli (multi-turn conversations)
2. All other unknown sessions → social (Bluesky one-off questions)

Note: Multi-turn conversations are a strong indicator of CLI usage.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from src.ops_model.base import get_ops_session_factory
from src.ops_model.chat_models import ChatSession, ChatMessage


def main():
    load_dotenv()

    SessionFactory = get_ops_session_factory()
    db_session = SessionFactory()

    try:
        # Get all unknown sessions
        unknown_sessions = (
            db_session.query(ChatSession).filter(ChatSession.source.is_(None)).all()
        )

        print(f"Found {len(unknown_sessions)} sessions with unknown source")

        if not unknown_sessions:
            print("No sessions to backfill!")
            return

        # Ask for confirmation
        response = input("\nProceed with backfill? (yes/no): ")
        if response.lower() not in ["yes", "y"]:
            print("Aborted.")
            return

        social_count = 0
        cli_count = 0

        for sess in unknown_sessions:
            # Count messages in this session
            msg_count = (
                db_session.query(ChatMessage)
                .filter(ChatMessage.session_id == sess.id)
                .count()
            )

            # Multi-turn conversations (>10 messages) are CLI
            if msg_count > 10:
                sess.source = "cli"
                cli_count += 1
            else:
                # Single/short conversations are Bluesky
                sess.source = "social"
                social_count += 1

        # Commit all changes
        db_session.commit()

        print("\n" + "=" * 60)
        print("Backfill completed!")
        print("=" * 60)
        print(f"  cli:                {cli_count} sessions")
        print(f"  social (Bluesky):   {social_count} sessions")
        print(f"  Total:              {cli_count + social_count}")
        print("=" * 60)

    finally:
        db_session.close()


if __name__ == "__main__":
    main()
