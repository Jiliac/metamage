"""
Unified Twitter/X client implementing the SocialClient protocol.
Uses tweepy library to handle v1.1 (media upload) and v2 (tweet creation) APIs.
"""

import os
import asyncio
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
import logging
import httpx
import tweepy

logger = logging.getLogger("social_clients.twitter")


class TwitterClient:
    """
    Unified Twitter/X client implementing the SocialClient protocol.
    Supports both posting (magebridge) and notifications/replies (socialbot).

    Uses tweepy to handle the complexity of mixing v1.1 and v2 APIs:
    - v1.1 API for media uploads (via tweepy.API)
    - v2 API for tweet creation (via tweepy.Client)
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
        self.api_key = os.getenv("TWITTER_API_KEY")
        self.api_secret = os.getenv("TWITTER_API_SECRET")
        self.access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        self.access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")

        # Initialize tweepy clients (will be set during authenticate)
        self.api_v1: Optional[tweepy.API] = None
        self.client_v2: Optional[tweepy.Client] = None

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
        Initializes both v1.1 and v2 API clients using tweepy.
        """
        missing = self._check_credentials()
        if missing:
            logger.error(f"Missing Twitter credentials: {', '.join(missing)}")
            return False

        try:
            # Initialize v1.1 API for media upload
            auth = tweepy.OAuth1UserHandler(
                self.api_key,
                self.api_secret,
            )
            auth.set_access_token(self.access_token, self.access_token_secret)
            self.api_v1 = tweepy.API(auth)

            # Initialize v2 API for tweeting
            self.client_v2 = tweepy.Client(
                consumer_key=self.api_key,
                consumer_secret=self.api_secret,
                access_token=self.access_token,
                access_token_secret=self.access_token_secret,
            )

            logger.info("Twitter credentials verified and clients initialized")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize Twitter clients: {e}")
            return False

    async def _download_image(self, url: str) -> Path:
        """
        Download image from URL to a temporary file.
        Returns the path to the temporary file.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=30.0)
                if response.status_code != 200:
                    raise Exception(f"Failed to download image: {response.status_code}")

                # Create temporary file
                suffix = Path(url.split("/")[-1].split("?")[0]).suffix or ".jpg"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(response.content)
                    return Path(tmp.name)

        except Exception as e:
            logger.error(f"Error downloading image from {url}: {e}")
            raise

    def _upload_image_sync(self, image_path: Path) -> str:
        """
        Upload image using tweepy v1.1 API (synchronous).
        Returns media_id string.
        """
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        media = self.api_v1.media_upload(str(image_path))
        return str(media.media_id)

    async def upload_image(self, image_path: Path) -> Optional[str]:
        """
        Upload image to Twitter using v1.1 API via tweepy.
        Returns media_id string on success, None on failure.
        """
        try:
            # Run the synchronous tweepy call in a thread pool
            loop = asyncio.get_event_loop()
            media_id = await loop.run_in_executor(
                None, self._upload_image_sync, image_path
            )
            logger.info(
                f"Successfully uploaded image: {image_path.name} (media_id: {media_id})"
            )
            # Rate limiting: wait 1 second between requests
            await asyncio.sleep(1)
            return media_id

        except Exception as e:
            logger.error(f"Error uploading image {image_path}: {e}")
            return None

    def _create_tweet_sync(
        self, text: str, media_ids: Optional[List[str]] = None
    ) -> dict:
        """
        Create tweet using tweepy v2 API (synchronous).
        Returns response data.
        """
        if media_ids:
            response = self.client_v2.create_tweet(text=text, media_ids=media_ids)
        else:
            response = self.client_v2.create_tweet(text=text)
        return response.data

    async def post_text(self, text: str) -> bool:
        """Post text content to Twitter."""
        if not await self.authenticate():
            return False

        try:
            # Run the synchronous tweepy call in a thread pool
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(None, self._create_tweet_sync, text, None)

            tweet_id = data.get("id", "unknown")
            logger.info(
                f"Successfully posted to Twitter: {text[:50]}... (ID: {tweet_id})"
            )
            # Rate limiting: wait 1 second between requests
            await asyncio.sleep(1)
            return True

        except Exception as e:
            logger.error(f"Error posting to Twitter: {e}")
            return False

    async def post_with_images(self, text: str, image_urls: List[str]) -> bool:
        """Post text with images to Twitter."""
        if not await self.authenticate():
            return False

        # Download and upload images
        media_ids = []
        temp_files = []  # Track temp files for cleanup

        try:
            for url in image_urls[:4]:  # Twitter supports max 4 images
                try:
                    # Check if it's a local file path or URL
                    if os.path.exists(url):
                        # Local file
                        image_path = Path(url)
                    else:
                        # Remote URL - download it
                        image_path = await self._download_image(url)
                        temp_files.append(image_path)

                    # Upload to Twitter
                    media_id = await self.upload_image(image_path)
                    if media_id:
                        media_ids.append(media_id)

                except Exception as e:
                    logger.error(f"Error processing image {url}: {e}")

            if not media_ids:
                # If no images could be processed, post text only
                logger.warning("No images uploaded successfully, posting text only")
                return await self.post_text(text)

            # Create tweet with media using tweepy v2 API
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(
                None, self._create_tweet_sync, text, media_ids
            )

            tweet_id = data.get("id", "unknown")
            logger.info(
                f"Successfully posted to Twitter with {len(media_ids)} images (ID: {tweet_id})"
            )
            # Rate limiting: wait 1 second between requests
            await asyncio.sleep(1)
            return True

        except Exception as e:
            logger.error(f"Error posting with images: {e}")
            return False

        finally:
            # Clean up temporary files
            for temp_file in temp_files:
                try:
                    temp_file.unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete temp file {temp_file}: {e}")

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
