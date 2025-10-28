"""Posting mixin for Twitter client."""

import os
import asyncio
import tempfile
import logging
from pathlib import Path
from typing import Optional, List
import httpx

logger = logging.getLogger("social_clients.twitter.posting")


class PostingMixin:
    """Handles posting text and images to Twitter using tweepy."""

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
