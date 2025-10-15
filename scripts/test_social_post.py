#!/usr/bin/env python3
"""
Test script for unified social client posting.
Posts a simple text message to verify the client works.
Can also test image posting with --with-images flag.

Usage:
    python scripts/test_social_post.py [--platform bluesky|twitter] [--with-images]
"""

import os
import sys
import asyncio
import argparse
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# Add src to path so we can import our modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.social_clients import BlueskyClient, TwitterClient


async def test_bluesky(with_images: bool = False):
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
    if with_images:
        print("📝 Posting test message with image...")
        test_text = f"Hello from unified client with image! 🤖 Testing Phase 1c at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        logo_path = Path(__file__).parent.parent / "docs" / "logo.png"
        if not logo_path.exists():
            print(f"❌ Image not found: {logo_path}")
            return False
        print(f"Using image: {logo_path} ({logo_path.stat().st_size / 1024:.1f} KB)")
        post_success = await client.post_with_images(test_text, [str(logo_path)])
    else:
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


async def test_twitter(with_images: bool = False):
    """Test Twitter posting with unified client."""
    print("🐦 Testing Twitter unified client")
    print("=" * 50)

    client = TwitterClient()

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
    if with_images:
        print("📝 Posting test message with image...")
        test_text = f"Hello from unified Twitter client with image! 🤖 Testing Phase 1c at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        logo_path = Path(__file__).parent.parent / "docs" / "logo.png"
        if not logo_path.exists():
            print(f"❌ Image not found: {logo_path}")
            return False
        print(f"Using image: {logo_path} ({logo_path.stat().st_size / 1024:.1f} KB)")
        post_success = await client.post_with_images(test_text, [str(logo_path)])
    else:
        print("📝 Posting test message...")
        test_text = f"Hello from unified Twitter client! 🤖 Testing Phase 1c at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        post_success = await client.post_text(test_text)

    if post_success:
        print("✅ Post successful!")
        print(f"Message: {test_text}")
        return True
    else:
        print("❌ Post failed")
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
    parser.add_argument(
        "--with-images",
        action="store_true",
        help="Test posting with images (uses docs/logo.png)",
    )
    args = parser.parse_args()

    phase = "Phase 1c" if args.with_images else "Phase 1b/1c"
    print(f"\n🧪 Social Client Posting Test - {phase}")
    print(f"Platform: {args.platform}")
    print(f"With images: {args.with_images}")
    print()

    if args.platform == "bluesky":
        success = await test_bluesky(with_images=args.with_images)
    elif args.platform == "twitter":
        success = await test_twitter(with_images=args.with_images)
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
