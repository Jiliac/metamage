#!/usr/bin/env python3
"""
Debug script to test Twitter media upload with detailed logging.
"""

import os
import sys
import asyncio
import httpx
import base64
import urllib.parse
import hmac
import hashlib
import secrets
import time
from dotenv import load_dotenv
from pathlib import Path


def oauth_signature(api_key, api_secret, access_token, access_token_secret, method, url):
    """Generate OAuth 1.0a signature."""
    # OAuth parameters
    oauth_params = {
        "oauth_consumer_key": api_key,
        "oauth_token": access_token,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_nonce": secrets.token_hex(16),
        "oauth_version": "1.0",
    }

    print(f"\nOAuth params:")
    for k, v in sorted(oauth_params.items()):
        print(f"  {k}: {v}")

    # Create parameter string (only OAuth params)
    param_string = "&".join(
        [
            f"{urllib.parse.quote(str(k), safe='~')}={urllib.parse.quote(str(v), safe='~')}"
            for k, v in sorted(oauth_params.items())
        ]
    )
    print(f"\nParameter string:\n  {param_string}")

    # Create signature base string
    base_string = f"{method}&{urllib.parse.quote(url, safe='~')}&{urllib.parse.quote(param_string, safe='~')}"
    print(f"\nSignature base string:\n  {base_string[:200]}...")

    # Create signing key
    signing_key = f"{urllib.parse.quote(api_secret, safe='~')}&{urllib.parse.quote(access_token_secret, safe='~')}"
    print(f"\nSigning key (obscured):\n  {signing_key[:20]}...{signing_key[-20:]}")

    # Generate signature
    signature = hmac.new(
        signing_key.encode(), base_string.encode(), hashlib.sha1
    ).digest()

    oauth_signature = base64.b64encode(signature).decode()
    oauth_params["oauth_signature"] = oauth_signature
    print(f"\nGenerated signature:\n  {oauth_signature}")

    return oauth_params


def oauth_header(oauth_params):
    """Generate OAuth Authorization header."""
    auth_header = "OAuth " + ", ".join(
        [
            f'{k}="{urllib.parse.quote(str(v), safe="~")}"'
            for k, v in oauth_params.items()
        ]
    )
    return auth_header


async def test_upload():
    load_dotenv()

    api_key = os.getenv("TWITTER_API_KEY")
    api_secret = os.getenv("TWITTER_API_SECRET")
    access_token = os.getenv("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")

    if not all([api_key, api_secret, access_token, access_token_secret]):
        print("❌ Missing Twitter credentials")
        return False

    print("🐦 Twitter Media Upload Debug")
    print("=" * 60)

    # Read a small test image
    logo_path = Path(__file__).parent.parent / "docs" / "logo.png"
    if not logo_path.exists():
        print(f"❌ Image not found: {logo_path}")
        return False

    with open(logo_path, "rb") as f:
        image_data = f.read()

    print(f"\n📁 Image size: {len(image_data) / 1024:.1f} KB")

    # Encode image
    encoded_image = base64.b64encode(image_data).decode("utf-8")
    print(f"📦 Encoded size: {len(encoded_image)} characters")

    # Test upload
    url = "https://upload.twitter.com/1.1/media/upload.json"
    print(f"\n🔗 Upload URL: {url}")

    oauth_params = oauth_signature(
        api_key, api_secret, access_token, access_token_secret, "POST", url
    )

    auth_header = oauth_header(oauth_params)
    print(f"\n🔑 Authorization header:\n  {auth_header[:100]}...")

    form_data = {"media_data": encoded_image}

    headers = {
        "Authorization": auth_header,
    }

    print(f"\n📤 Sending request...")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                url, headers=headers, data=form_data, timeout=60.0
            )

            print(f"\n📥 Response status: {response.status_code}")
            print(f"📥 Response headers:")
            for k, v in response.headers.items():
                if k.lower() not in ["set-cookie"]:
                    print(f"  {k}: {v}")

            print(f"\n📥 Response body:")
            print(f"  {response.text}")

            if response.status_code == 200:
                data = response.json()
                media_id = data.get("media_id_string")
                print(f"\n✅ Success! Media ID: {media_id}")
                return True
            else:
                print(f"\n❌ Failed with status {response.status_code}")
                return False

        except Exception as e:
            print(f"\n❌ Exception: {e}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = asyncio.run(test_upload())
    sys.exit(0 if success else 1)
