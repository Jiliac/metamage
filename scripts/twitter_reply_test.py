#!/usr/bin/env python3
"""
Test script for Twitter reply functionality (Phase 2c).

Replies to a specific mention with a test message to validate reply() works.

Environment variables required:
- TWITTER_API_KEY
- TWITTER_API_SECRET
- TWITTER_ACCESS_TOKEN
- TWITTER_ACCESS_TOKEN_SECRET
"""

import os
import asyncio
from dotenv import load_dotenv
import tweepy

load_dotenv()

# Test mention from data/twitter_test_mentions.json
TEST_MENTION_ID = "1983055639778828673"
TEST_MENTION_AUTHOR = "@ThanksWili"
TEST_MENTION_TEXT = "Whats the difference between rakdos midrange and rakdos demons?"


def get_authenticated_client():
    """Get authenticated Twitter client."""
    api_key = os.getenv("TWITTER_API_KEY")
    api_secret = os.getenv("TWITTER_API_SECRET")
    access_token = os.getenv("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")

    if not all([api_key, api_secret, access_token, access_token_secret]):
        raise ValueError("Missing required Twitter credentials")

    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )
    return client


async def test_reply():
    """Test posting a reply to the specified mention."""
    print("=" * 60)
    print("Twitter Reply Test - Phase 2c")
    print("=" * 60)
    print(f"\nReplying to mention ID: {TEST_MENTION_ID}")
    print(f"From: {TEST_MENTION_AUTHOR}")
    print(f"Question: {TEST_MENTION_TEXT}")
    print()

    client = get_authenticated_client()

    # Construct reply text
    reply_text = "Hello test - validating reply functionality for Phase 2c"

    print(f"Reply text: {reply_text}")
    print("\n⚠️  This will post a REAL reply to Twitter!")
    print("Press Ctrl+C now to cancel, or wait 3 seconds to proceed...")

    try:
        await asyncio.sleep(3)
    except KeyboardInterrupt:
        print("\n\nCancelled by user. No reply posted.")
        return

    print("\nPosting reply...")

    try:
        response = client.create_tweet(
            text=reply_text, in_reply_to_tweet_id=TEST_MENTION_ID
        )

        reply_id = response.data["id"]
        print("\n✅ Reply posted successfully!")
        print(f"Reply ID: {reply_id}")
        print(f"URL: https://twitter.com/_MetaMage_/status/{reply_id}")

    except Exception as e:
        print(f"\n❌ Error posting reply: {e}")
        import traceback

        traceback.print_exc()


async def main():
    await test_reply()


if __name__ == "__main__":
    asyncio.run(main())
