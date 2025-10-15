#!/usr/bin/env python3
"""
Test script for unified social client posting.
Posts a simple text message to verify the client works.

Usage:
    python scripts/test_social_post.py [--platform bluesky|twitter]
"""

import os
import sys
import asyncio
import argparse
from datetime import datetime
from dotenv import load_dotenv

# Add src to path so we can import our modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.social_clients import BlueskyClient


async def test_bluesky():
    """Test Bluesky posting with unified client."""
    print("🔵 Testing Bluesky unified client")
    print("=" * 50)

    client = BlueskyClient()

    # Check credentials
    if not os.getenv("BLUESKY_USERNAME") or not os.getenv("BLUESKY_PASSWORD"):
        print("❌ Missing BLUESKY_USERNAME or BLUESKY_PASSWORD")
        return False

    # Display client properties
    print(f"Platform: {client.platform_name}")
    print(f"Max text length: {client.max_text_len}")
    print(f"Max images: {client.max_images}")
    print(f"Supported media types: {client.supported_media_types}")
    print()

    # Test authentication
    print("🔐 Authenticating...")
    auth_success = await client.authenticate()
    if not auth_success:
        print("❌ Authentication failed")
        return False
    print("✅ Authentication successful")
    print()

    # Test posting
    print("📝 Posting test message...")
    test_text = f"Hello from unified client! 🤖 Testing Phase 1b at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    post_success = await client.post_text(test_text)

    if post_success:
        print("✅ Post successful!")
        print(f"Message: {test_text}")
        return True
    else:
        print("❌ Post failed")
        return False


async def test_twitter():
    """Test Twitter posting with unified client (Phase 1c - not yet implemented)."""
    print("🐦 Testing Twitter unified client")
    print("=" * 50)
    print("⚠️  Twitter client not yet implemented (Phase 1c)")
    return False


async def main():
    load_dotenv()

    parser = argparse.ArgumentParser(description="Test social client posting")
    parser.add_argument(
        "--platform",
        choices=["bluesky", "twitter"],
        default="bluesky",
        help="Platform to test (default: bluesky)",
    )
    args = parser.parse_args()

    print("\n🧪 Social Client Posting Test - Phase 1b")
    print(f"Platform: {args.platform}")
    print()

    if args.platform == "bluesky":
        success = await test_bluesky()
    elif args.platform == "twitter":
        success = await test_twitter()
    else:
        print(f"❌ Unknown platform: {args.platform}")
        return False

    print()
    if success:
        print("🎉 All tests passed!")
    else:
        print("❌ Tests failed")

    return success


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
