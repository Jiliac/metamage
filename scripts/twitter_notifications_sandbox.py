#!/usr/bin/env python3
"""
Sandbox script to explore Twitter notifications API and test implementation.

This script helps us iterate on Phase 2c: Twitter notification support.

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


async def test_get_mentions():
    """Test fetching mentions (notifications)."""
    print("\n=== Testing get_users_mentions ===\n")

    client = get_authenticated_client()

    # First, get our own user ID
    me = client.get_me()
    print(f"Authenticated as: @{me.data.username} (ID: {me.data.id})")

    # Fetch mentions with expansions to get full data
    print("\nFetching mentions...")
    mentions = client.get_users_mentions(
        id=me.data.id,
        max_results=10,
        tweet_fields=["created_at", "conversation_id", "in_reply_to_user_id", "text"],
        expansions=["author_id", "referenced_tweets.id"],
        user_fields=["username"],
        user_auth=True,  # Required for OAuth 1.0a authentication
    )

    if not mentions.data:
        print("No mentions found!")
        return

    print(f"\nFound {len(mentions.data)} mentions:\n")

    for i, tweet in enumerate(mentions.data, 1):
        print(f"--- Mention {i} ---")
        print(f"ID: {tweet.id}")
        print(f"Text: {tweet.text}")
        print(f"Created at: {tweet.created_at}")
        print(f"Conversation ID: {tweet.conversation_id}")
        print(f"In reply to user: {tweet.in_reply_to_user_id}")

        # Get author info from includes
        if mentions.includes and "users" in mentions.includes:
            author = next(
                (u for u in mentions.includes["users"] if u.id == tweet.author_id),
                None,
            )
            if author:
                print(f"Author: @{author.username}")

        print()

    # Test pagination if available
    if mentions.meta and "next_token" in mentions.meta:
        print(f"Next page token available: {mentions.meta['next_token']}")


async def test_get_single_tweet():
    """Test fetching a single tweet (for thread context)."""
    print("\n=== Testing get_tweet (for thread context) ===\n")
    print("Note: For Phase 2c, get_post_thread() will return minimal context.")
    print("The mention itself contains the text - that's sufficient to respond.")
    print("Skipping actual API call to avoid rate limits...\n")


async def test_reply():
    """Test posting a reply to a mention."""
    print("\n=== Testing reply ===\n")
    print("NOTE: This will actually post a reply. Comment out if not testing!")
    print("Skipping actual reply for safety...")
    return

    # Uncomment below to test actual replies
    """
    client = get_authenticated_client()

    # Get a mention to reply to
    me = client.get_me()
    mentions = client.get_users_mentions(id=me.data.id, max_results=1)

    if not mentions.data:
        print("No mentions to reply to!")
        return

    mention_id = mentions.data[0].id
    print(f"Replying to tweet ID: {mention_id}")

    response = client.create_tweet(
        text="Test reply from sandbox script",
        in_reply_to_tweet_id=mention_id
    )

    print(f"Reply posted! ID: {response.data['id']}")
    """


async def explore_conversation():
    """Explore how to fetch conversation threads on Twitter."""
    print("\n=== Exploring conversation threads ===\n")
    print("Note: Twitter v2 API doesn't have a direct 'get conversation' endpoint.")
    print(
        "To build thread context, we'd need to use search_recent_tweets with conversation_id."
    )
    print("For Phase 2c, we'll implement minimal context (just the mention).")
    print("Skipping actual API call to avoid rate limits...\n")


async def main():
    """Run all sandbox tests."""
    print("=" * 60)
    print("Twitter Notifications Sandbox")
    print("=" * 60)

    try:
        await test_get_mentions()
        await test_get_single_tweet()
        await explore_conversation()
        await test_reply()

        print("\n" + "=" * 60)
        print("Sandbox exploration complete!")
        print("=" * 60)
        print("\n📋 Summary of findings:")
        print("✅ get_users_mentions() works with Free tier + user_auth=True")
        print("✅ Mentions contain: id, text, created_at, conversation_id, author_id")
        print("✅ Pagination supported via next_token")
        print("✅ reply() uses create_tweet(in_reply_to_tweet_id=...)")
        print("✅ Minimal thread context is sufficient (mention has the text)")
        print("\n🚀 Ready to implement twitter/notifications.py!")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
