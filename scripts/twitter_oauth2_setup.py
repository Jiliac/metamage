#!/usr/bin/env python3
"""
One-time OAuth 2.0 PKCE setup for Twitter API v2.
This script will open a browser for authorization and obtain tokens with media.write scope.

After running this once, you'll have a refresh token that can be used without browser interaction.

Required scopes: tweet.read, tweet.write, users.read, offline.access
Optional but recommended: media.write (for uploading images)
"""

import os
import sys
import asyncio
import webbrowser
import secrets
import hashlib
import base64
import httpx
from urllib.parse import urlencode, parse_qs, urlparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv, set_key
from pathlib import Path


# Global variable to store the authorization code
auth_code = None
auth_state = None


class CallbackHandler(BaseHTTPRequestHandler):
    """HTTP server handler to receive OAuth callback."""

    def do_GET(self):
        global auth_code, auth_state

        # Parse query parameters
        query = urlparse(self.path).query
        params = parse_qs(query)

        if "code" in params and "state" in params:
            auth_code = params["code"][0]
            received_state = params["state"][0]

            # Verify state matches
            if received_state == auth_state:
                self.send_response(200)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h1>Authorization successful!</h1>"
                    b"<p>You can close this window and return to the terminal.</p></body></html>"
                )
            else:
                self.send_response(400)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h1>Error: State mismatch</h1></body></html>"
                )
        else:
            self.send_response(400)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(
                b"<html><body><h1>Error: Missing parameters</h1></body></html>"
            )

    def log_message(self, format, *args):
        # Suppress log messages
        pass


def generate_pkce_pair():
    """Generate PKCE code verifier and challenge."""
    # Generate code verifier (43-128 characters)
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("utf-8")
    code_verifier = code_verifier.rstrip("=")

    # Generate code challenge
    code_challenge = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    code_challenge = base64.urlsafe_b64encode(code_challenge).decode("utf-8")
    code_challenge = code_challenge.rstrip("=")

    return code_verifier, code_challenge


async def get_authorization_code(client_id, redirect_uri, code_challenge, scopes):
    """Open browser for user authorization and wait for callback."""
    global auth_code, auth_state

    # Generate random state
    auth_state = secrets.token_urlsafe(32)

    # Build authorization URL
    auth_params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": " ".join(scopes),
        "state": auth_state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }

    auth_url = f"https://twitter.com/i/oauth2/authorize?{urlencode(auth_params)}"

    print(f"\n🌐 Opening browser for authorization...")
    print(f"📋 If browser doesn't open, visit this URL:\n{auth_url}\n")

    # Open browser
    webbrowser.open(auth_url)

    # Start local HTTP server to receive callback
    # Use 127.0.0.1 to match the redirect URI
    server = HTTPServer(("127.0.0.1", 8080), CallbackHandler)
    print("⏳ Waiting for authorization callback...")
    print("   (The browser will redirect back after you authorize)")

    # Wait for callback (timeout after 5 minutes)
    timeout = 300  # 5 minutes
    for _ in range(timeout):
        server.handle_request()
        if auth_code:
            break
        await asyncio.sleep(0.1)

    if not auth_code:
        print("\n❌ Authorization timed out")
        return None

    return auth_code


async def exchange_code_for_tokens(
    client_id, redirect_uri, code, code_verifier, client_secret=None
):
    """Exchange authorization code for access and refresh tokens."""
    token_url = "https://api.twitter.com/2/oauth2/token"

    data = {
        "code": code,
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }

    # Add client secret if provided (for confidential clients)
    if client_secret:
        data["client_secret"] = client_secret

    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=data, headers=headers)

        if response.status_code == 200:
            return response.json()
        else:
            print(f"\n❌ Token exchange failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None


async def refresh_access_token(client_id, refresh_token, client_secret=None):
    """Use refresh token to get a new access token."""
    token_url = "https://api.twitter.com/2/oauth2/token"

    data = {
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        "client_id": client_id,
    }

    if client_secret:
        data["client_secret"] = client_secret

    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=data, headers=headers)

        if response.status_code == 200:
            return response.json()
        else:
            print(f"\n❌ Token refresh failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None


def save_tokens_to_env(access_token, refresh_token):
    """Save tokens to .env file."""
    env_path = Path(__file__).parent.parent / ".env"

    if not env_path.exists():
        print(f"\n⚠️  .env file not found at {env_path}")
        print("Creating new .env file...")
        env_path.touch()

    set_key(env_path, "TWITTER_OAUTH2_ACCESS_TOKEN", access_token)
    set_key(env_path, "TWITTER_OAUTH2_REFRESH_TOKEN", refresh_token)

    print(f"\n✅ Tokens saved to {env_path}")
    print("   TWITTER_OAUTH2_ACCESS_TOKEN")
    print("   TWITTER_OAUTH2_REFRESH_TOKEN")


async def main():
    load_dotenv()

    print("🐦 Twitter OAuth 2.0 PKCE Setup")
    print("=" * 60)

    # Get client credentials from environment
    client_id = os.getenv("TWITTER_CLIENT_ID")
    client_secret = os.getenv("TWITTER_CLIENT_SECRET")

    if not client_id:
        print("\n❌ TWITTER_CLIENT_ID not found in .env file")
        print("Please add your Twitter OAuth 2.0 Client ID to .env")
        return False

    print(f"\n📋 Client ID: {client_id}")
    print(f"📋 Client Secret: {'Set' if client_secret else 'Not set (public client)'}")

    # Configuration
    # Use ngrok URL for OAuth callback (Twitter requires public HTTPS URL)
    ngrok_url = os.getenv("NGROK_URL", "https://55e77330e546.ngrok-free.app")
    redirect_uri = f"{ngrok_url}/callback"
    scopes = [
        "tweet.read",
        "tweet.write",
        "users.read",
        "offline.access",  # Required for refresh token
    ]

    print(f"\n📋 Redirect URI: {redirect_uri}")
    print(f"📋 Scopes: {', '.join(scopes)}")
    print(
        "\n⚠️  Make sure this redirect URI is configured in your Twitter App settings!"
    )
    print("   Go to: https://developer.twitter.com/en/portal/projects-and-apps")
    print("   → Your App → Settings → User authentication settings")
    print("   → Callback URI / Redirect URL\n")

    input("Press Enter to continue once you've verified the redirect URI...")

    # Generate PKCE pair
    code_verifier, code_challenge = generate_pkce_pair()
    print(f"\n🔐 Generated PKCE challenge")

    # Get authorization code
    code = await get_authorization_code(client_id, redirect_uri, code_challenge, scopes)

    if not code:
        return False

    print(f"\n✅ Authorization code received")

    # Exchange code for tokens
    print("\n🔄 Exchanging code for tokens...")
    tokens = await exchange_code_for_tokens(
        client_id, redirect_uri, code, code_verifier, client_secret
    )

    if not tokens:
        return False

    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in")

    print(f"\n✅ Tokens obtained!")
    print(
        f"   Access token expires in: {expires_in} seconds ({expires_in // 3600} hours)"
    )
    print(f"   Refresh token: {'Received' if refresh_token else 'Not received'}")

    # Save tokens
    if access_token and refresh_token:
        save_tokens_to_env(access_token, refresh_token)
        print(
            "\n🎉 Setup complete! You can now use these tokens for Twitter API v2 requests."
        )
        print(
            "   The refresh token can be used to get new access tokens without browser authorization."
        )
        return True
    else:
        print("\n❌ Failed to obtain tokens")
        return False


if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(1)
