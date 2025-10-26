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

from src.social_clients import BlueskyClient, TwitterClient, SocialMultiplexer


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


async def test_multiplexer(with_images: bool = False):
    """Test multiplexer posting to all platforms."""
    print("🌐 Testing SocialMultiplexer (all platforms)")
    print("=" * 50)

    # Initialize clients based on available credentials
    clients = []

    if os.getenv("BLUESKY_USERNAME") and os.getenv("BLUESKY_PASSWORD"):
        clients.append(BlueskyClient())
        print("✓ Bluesky client added")

    if os.getenv("TWITTER_API_KEY") and os.getenv("TWITTER_ACCESS_TOKEN"):
        clients.append(TwitterClient())
        print("✓ Twitter client added")

    if not clients:
        print("❌ No social platform credentials found")
        return False

    print(f"\nMultiplexer configured with {len(clients)} platforms")
    print()

    multiplexer = SocialMultiplexer(clients)

    # Display platform limits
    limits = multiplexer.get_platform_limits()
    print("Platform limits:")
    for platform, platform_limits in limits.items():
        print(
            f"  {platform}: {platform_limits['max_text_len']} chars, {platform_limits['max_images']} images"
        )

    restrictive = multiplexer.get_most_restrictive_limits()
    print(
        f"\nMost restrictive: {restrictive['max_text_len']} chars, {restrictive['max_images']} images"
    )
    print()

    # Test authentication
    print("🔐 Authenticating all platforms...")
    auth_results = await multiplexer.authenticate()
    for platform, success in auth_results.items():
        status = "✅" if success else "❌"
        print(f"  {status} {platform}: {'success' if success else 'failed'}")

    if not any(auth_results.values()):
        print("\n❌ All authentications failed")
        return False
    print()

    # Test posting
    if with_images:
        print("📝 Posting to all platforms with image...")
        test_text = f"Hello from SocialMultiplexer with image! 🤖 Testing Phase 1d at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        logo_path = Path(__file__).parent.parent / "docs" / "logo.png"
        if not logo_path.exists():
            print(f"❌ Image not found: {logo_path}")
            return False
        print(f"Using image: {logo_path} ({logo_path.stat().st_size / 1024:.1f} KB)")
        post_results = await multiplexer.post_with_images(test_text, [str(logo_path)])
    else:
        print("📝 Posting to all platforms...")
        test_text = f"Hello from SocialMultiplexer! 🤖 Testing Phase 1d at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        post_results = await multiplexer.post_text(test_text)

    print("\nPost results:")
    for platform, success in post_results.items():
        status = "✅" if success else "❌"
        print(f"  {status} {platform}: {'success' if success else 'failed'}")

    all_success = all(post_results.values())
    some_success = any(post_results.values())

    print()
    if all_success:
        print("✅ All platforms posted successfully!")
        print(f"Message: {test_text}")
        return True
    elif some_success:
        print("⚠️  Some platforms posted successfully")
        print(f"Message: {test_text}")
        return True
    else:
        print("❌ All platforms failed to post")
        return False


async def main():
    load_dotenv()

    parser = argparse.ArgumentParser(description="Test social client posting")
    parser.add_argument(
        "--platform",
        choices=["bluesky", "twitter", "all"],
        default="all",
        help="Platform to test (default: all via multiplexer)",
    )
    parser.add_argument(
        "--with-images",
        action="store_true",
        help="Test posting with images (uses docs/logo.png)",
    )
    args = parser.parse_args()

    phase = "Phase 1d" if args.platform == "all" else "Phase 1c"
    print(f"\n🧪 Social Client Posting Test - {phase}")
    print(f"Platform: {args.platform}")
    print(f"With images: {args.with_images}")
    print()

    if args.platform == "bluesky":
        success = await test_bluesky(with_images=args.with_images)
    elif args.platform == "twitter":
        success = await test_twitter(with_images=args.with_images)
    elif args.platform == "all":
        success = await test_multiplexer(with_images=args.with_images)
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
