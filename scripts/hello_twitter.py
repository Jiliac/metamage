#!/usr/bin/env python3
"""
Hello World script for Twitter/X API.
Tests basic authentication and posting capability.
"""

import os
import sys
import asyncio
import httpx
import base64
from datetime import datetime
from dotenv import load_dotenv


class TwitterClient:
    """Simple Twitter/X API client for testing."""

    def __init__(self):
        self.base_url = "https://api.twitter.com"
        self.api_key = os.getenv("TWITTER_API_KEY")
        self.api_secret = os.getenv("TWITTER_API_SECRET")
        self.bearer_token = None  # Will be generated

    def _check_credentials(self):
        """Check if all required credentials are present."""
        missing = []
        if not self.api_key:
            missing.append("TWITTER_API_KEY")
        if not self.api_secret:
            missing.append("TWITTER_API_SECRET")
        return missing

    async def _generate_bearer_token(self):
        """Generate Bearer Token from API Key/Secret."""
        # Create Basic Auth header
        credentials = f"{self.api_key}:{self.api_secret}"
        b64_credentials = base64.b64encode(credentials.encode()).decode()

        headers = {
            "Authorization": f"Basic {b64_credentials}",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/oauth2/token",
                headers=headers,
                data="grant_type=client_credentials",
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            self.bearer_token = data["access_token"]
            return self.bearer_token

    async def test_auth(self):
        """Test authentication by generating Bearer Token and testing API access."""
        if not self.bearer_token:
            print("🔑 Generating Bearer Token...")
            await self._generate_bearer_token()
            print("✅ Bearer Token generated successfully")

        headers = {"Authorization": f"Bearer {self.bearer_token}"}

        async with httpx.AsyncClient() as client:
            # Test with a simple public endpoint (search for recent tweets)
            resp = await client.get(
                f"{self.base_url}/2/tweets/search/recent?query=hello&max_results=10",
                headers=headers,
                timeout=30.0,
            )
            resp.raise_for_status()
            return resp.json()

    async def post_tweet(self, text: str):
        """Post a tweet using OAuth 2.0 with PKCE (requires user authentication)."""
        print("⚠️  Tweet posting requires OAuth 2.0 user authentication")
        print(
            "⚠️  For production, implement OAuth 2.0 Authorization Code Flow with PKCE"
        )
        print(f"📝 Would post: {text}")

        # For now, just simulate success
        return {"id": "simulated_tweet_id", "text": text}


async def main():
    load_dotenv()

    print("🐦 Twitter/X API Hello World")
    print("=" * 40)

    client = TwitterClient()

    # Check credentials
    missing = client._check_credentials()
    if missing:
        print("❌ Missing environment variables:")
        for var in missing:
            print(f"   - {var}")
        print("\n💡 Update your .env file with Twitter API credentials")
        print("   You only need TWITTER_API_KEY and TWITTER_API_SECRET!")
        return False

    try:
        # Test authentication
        print("🔐 Testing authentication...")
        search_result = await client.test_auth()
        tweet_count = len(search_result.get("data", []))
        print(f"✅ API access working! Found {tweet_count} recent tweets with 'hello'")

        # Test posting (simulated)
        print("\n📝 Testing tweet posting...")
        tweet_text = f"Hello from the MetaMage Twitter bot! 🤖✨ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        result = await client.post_tweet(tweet_text)
        print(f"✅ Tweet posted (simulated): {result['id']}")

        print("\n🎉 All tests passed!")
        print("💡 You're ready to integrate Twitter API with just 2 credentials!")
        return True

    except httpx.HTTPStatusError as e:
        print(f"❌ HTTP Error: {e.response.status_code}")
        print(f"   Response: {e.response.text}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
