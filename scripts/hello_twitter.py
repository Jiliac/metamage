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
import urllib.parse
from datetime import datetime
from dotenv import load_dotenv


class TwitterClient:
    """Simple Twitter/X API client for testing."""

    def __init__(self):
        self.base_url = "https://api.twitter.com"
        self.api_key = os.getenv("TWITTER_API_KEY")
        self.api_secret = os.getenv("TWITTER_API_SECRET")
        self.access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        self.access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")
        self.bearer_token = None  # Will be generated

    def _check_credentials(self):
        """Check if all required credentials are present."""
        missing = []
        if not self.api_key:
            missing.append("TWITTER_API_KEY")
        if not self.api_secret:
            missing.append("TWITTER_API_SECRET")
        if not self.access_token:
            missing.append("TWITTER_ACCESS_TOKEN")
        if not self.access_token_secret:
            missing.append("TWITTER_ACCESS_TOKEN_SECRET")
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

    def _oauth_signature(self, method: str, url: str, body_params: dict = None) -> str:
        """Generate OAuth 1.0a signature for tweet posting."""
        import hmac
        import hashlib
        import urllib.parse
        import secrets
        import time

        # OAuth parameters
        oauth_params = {
            "oauth_consumer_key": self.api_key,
            "oauth_token": self.access_token,
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": str(int(time.time())),
            "oauth_nonce": secrets.token_hex(16),
            "oauth_version": "1.0",
        }

        # For OAuth signature, we only include query parameters, not JSON body
        # Since we're using JSON body, no additional params for signature
        all_params = oauth_params.copy()

        # Create parameter string
        param_string = "&".join(
            [
                f"{urllib.parse.quote(str(k), safe='~')}={urllib.parse.quote(str(v), safe='~')}"
                for k, v in sorted(all_params.items())
            ]
        )

        # Create signature base string
        base_string = f"{method}&{urllib.parse.quote(url, safe='~')}&{urllib.parse.quote(param_string, safe='~')}"

        # Create signing key
        signing_key = f"{urllib.parse.quote(self.api_secret, safe='~')}&{urllib.parse.quote(self.access_token_secret, safe='~')}"

        # Generate signature
        signature = hmac.new(
            signing_key.encode(), base_string.encode(), hashlib.sha1
        ).digest()

        oauth_signature = base64.b64encode(signature).decode()
        oauth_params["oauth_signature"] = oauth_signature

        return oauth_params

    async def post_tweet(self, text: str):
        """Post a tweet using OAuth 1.0a authentication."""
        url = f"{self.base_url}/2/tweets"
        body = {"text": text}

        # Generate OAuth signature (no body params for signature)
        oauth_params = self._oauth_signature("POST", url)

        # Create Authorization header
        auth_header = "OAuth " + ", ".join(
            [
                f'{k}="{urllib.parse.quote(str(v), safe="~")}"'
                for k, v in oauth_params.items()
            ]
        )

        headers = {"Authorization": auth_header, "Content-Type": "application/json"}

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json=body, timeout=30.0)
            resp.raise_for_status()
            return resp.json()


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
        print("   You need all 4 credentials from your Twitter Developer Dashboard!")
        return False

    try:
        # Skip read testing to avoid rate limits, go straight to posting
        print("🔐 Skipping read test to avoid rate limits...")

        # Test posting (real!)
        print("📝 Testing tweet posting...")
        tweet_text = f"Hello from the MetaMage Twitter bot! 🤖✨ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        result = await client.post_tweet(tweet_text)
        tweet_id = result.get("data", {}).get("id", "unknown")
        print(f"✅ Tweet posted successfully! ID: {tweet_id}")
        print(f"🔗 View at: https://twitter.com/user/status/{tweet_id}")

        print("\n🎉 Tweet posting works!")
        print("💡 Twitter API integration working with OAuth 1.0a!")
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
