import os
import asyncio
import httpx
import base64
import urllib.parse
import hmac
import hashlib
import secrets
import time
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
import logging

logger = logging.getLogger("social_clients.twitter")


class TwitterClient:
    """
    Unified Twitter/X client implementing the SocialClient protocol.
    Supports both posting (magebridge) and notifications/replies (socialbot).
    """

    # Protocol properties
    @property
    def platform_name(self) -> str:
        """Platform identifier for Twitter."""
        return "twitter"

    @property
    def max_text_len(self) -> int:
        """Twitter supports 280 characters."""
        return 280

    @property
    def max_images(self) -> int:
        """Twitter supports up to 4 images per tweet."""
        return 4

    @property
    def supported_media_types(self) -> Optional[List[str]]:
        """Twitter supports common image formats."""
        return ["image/jpeg", "image/png", "image/gif", "image/webp"]

    def __init__(self):
        self.base_url = "https://api.twitter.com"
        self.upload_url = (
            "https://upload.twitter.com"  # Separate domain for media uploads
        )
        self.api_key = os.getenv("TWITTER_API_KEY")
        self.api_secret = os.getenv("TWITTER_API_SECRET")
        self.access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        self.access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")

    def _check_credentials(self) -> List[str]:
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

    async def authenticate(self) -> bool:
        """
        Authenticate with Twitter.
        For Twitter, we use OAuth 1.0a which doesn't require a separate auth step,
        but we verify credentials are present.
        """
        missing = self._check_credentials()
        if missing:
            logger.error(f"Missing Twitter credentials: {', '.join(missing)}")
            return False
        logger.info("Twitter credentials verified")
        return True

    def _oauth_signature(self, method: str, url: str) -> Dict[str, str]:
        """Generate OAuth 1.0a signature for API requests."""
        # OAuth parameters
        oauth_params = {
            "oauth_consumer_key": self.api_key,
            "oauth_token": self.access_token,
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": str(int(time.time())),
            "oauth_nonce": secrets.token_hex(16),
            "oauth_version": "1.0",
        }

        # Create parameter string (only OAuth params, no body params for JSON requests)
        param_string = "&".join(
            [
                f"{urllib.parse.quote(str(k), safe='~')}={urllib.parse.quote(str(v), safe='~')}"
                for k, v in sorted(oauth_params.items())
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

    def _oauth_header(self, method: str, url: str) -> str:
        """Generate OAuth Authorization header."""
        oauth_params = self._oauth_signature(method, url)
        auth_header = "OAuth " + ", ".join(
            [
                f'{k}="{urllib.parse.quote(str(v), safe="~")}"'
                for k, v in oauth_params.items()
            ]
        )
        return auth_header

    async def post_text(self, text: str) -> bool:
        """Post text content to Twitter."""
        if not await self.authenticate():
            return False

        try:
            url = f"{self.base_url}/2/tweets"
            body = {"text": text}

            headers = {
                "Authorization": self._oauth_header("POST", url),
                "Content-Type": "application/json",
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url, headers=headers, json=body, timeout=30.0
                )

                if response.status_code == 201:
                    data = response.json()
                    tweet_id = data.get("data", {}).get("id", "unknown")
                    logger.info(
                        f"Successfully posted to Twitter: {text[:50]}... (ID: {tweet_id})"
                    )
                    # Rate limiting: wait 1 second between requests
                    await asyncio.sleep(1)
                    return True
                else:
                    logger.error(
                        f"Failed to post to Twitter: {response.status_code} {response.text}"
                    )
                    return False

        except Exception as e:
            logger.error(f"Error posting to Twitter: {e}")
            return False

    async def upload_image(self, image_data: bytes, filename: str) -> Optional[str]:
        """
        Upload image to Twitter using v1.1 media upload endpoint.
        Returns media_id string on success, None on failure.

        Note: Twitter uses upload.twitter.com domain for media uploads.
        OAuth signature is computed on the URL only, not the body content.
        """
        if not await self.authenticate():
            return None

        try:
            # Use upload.twitter.com domain for media uploads
            url = f"{self.upload_url}/1.1/media/upload.json"

            # Use media_data parameter with base64 encoding
            encoded_image = base64.b64encode(image_data).decode("utf-8")

            # Use form data (application/x-www-form-urlencoded)
            form_data = {"media_data": encoded_image}

            # Generate OAuth header
            headers = {
                "Authorization": self._oauth_header("POST", url),
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url, headers=headers, data=form_data, timeout=60.0
                )

                if response.status_code == 200:
                    data = response.json()
                    media_id = data.get("media_id_string")
                    logger.info(
                        f"Successfully uploaded image: {filename} (media_id: {media_id})"
                    )
                    # Rate limiting: wait 1 second between requests
                    await asyncio.sleep(1)
                    return media_id
                else:
                    logger.error(
                        f"Failed to upload image: {response.status_code} {response.text}"
                    )
                    return None

        except Exception as e:
            logger.error(f"Error uploading image: {e}")
            return None

    async def post_with_images(self, text: str, image_urls: List[str]) -> bool:
        """Post text with images to Twitter."""
        if not await self.authenticate():
            return False

        # Download and upload images
        media_ids = []
        for url in image_urls[:4]:  # Twitter supports max 4 images
            try:
                # Check if it's a local file path
                if os.path.exists(url):
                    # Local file
                    with open(url, "rb") as f:
                        image_data = f.read()
                    filename = os.path.basename(url)
                else:
                    # Remote URL - download it
                    async with httpx.AsyncClient() as client:
                        img_response = await client.get(url, timeout=30.0)
                        if img_response.status_code != 200:
                            logger.error(f"Failed to download image from {url}")
                            continue
                        image_data = img_response.content
                        filename = url.split("/")[-1].split("?")[0]

                media_id = await self.upload_image(image_data, filename)
                if media_id:
                    media_ids.append(media_id)
            except Exception as e:
                logger.error(f"Error processing image {url}: {e}")

        if not media_ids:
            # If no images could be processed, post text only
            logger.warning("No images uploaded successfully, posting text only")
            return await self.post_text(text)

        # Create tweet with media
        try:
            url = f"{self.base_url}/2/tweets"
            body = {"text": text, "media": {"media_ids": media_ids}}

            headers = {
                "Authorization": self._oauth_header("POST", url),
                "Content-Type": "application/json",
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url, headers=headers, json=body, timeout=30.0
                )

                if response.status_code == 201:
                    data = response.json()
                    tweet_id = data.get("data", {}).get("id", "unknown")
                    logger.info(
                        f"Successfully posted to Twitter with {len(media_ids)} images (ID: {tweet_id})"
                    )
                    # Rate limiting: wait 1 second between requests
                    await asyncio.sleep(1)
                    return True
                else:
                    logger.error(
                        f"Failed to post with images: {response.status_code} {response.text}"
                    )
                    return False

        except Exception as e:
            logger.error(f"Error posting with images: {e}")
            return False

    # Notification methods (Phase 2 - stubs for now)
    async def list_notifications(
        self,
        cursor: Optional[str] = None,
        since: Optional[datetime] = None,
        types: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        List notifications from Twitter.

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2c.
        """
        raise NotImplementedError(
            "Notification support will be implemented in Phase 2c"
        )

    async def get_post_thread(self, uri: str, depth: int = 10) -> Dict[str, Any]:
        """
        Fetch the full post thread for context.

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2c.
        """
        raise NotImplementedError("Thread fetching will be implemented in Phase 2c")

    async def reply(
        self,
        text: str,
        parent_uri: str,
        parent_cid: Optional[str],
        root_uri: str,
        root_cid: Optional[str],
        link_url: Optional[str] = None,
    ) -> str:
        """
        Post a reply to a given parent/root.

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2c.
        """
        raise NotImplementedError("Reply support will be implemented in Phase 2c")
