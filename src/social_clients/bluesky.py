import os
import re
import httpx
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
import mimetypes
from PIL import Image
import io
import logging

logger = logging.getLogger("social_clients.bluesky")


class BlueskyClient:
    """
    Unified Bluesky client implementing the SocialClient protocol.
    Supports both posting (magebridge) and notifications/replies (socialbot).
    """

    # Protocol properties
    @property
    def platform_name(self) -> str:
        """Platform identifier for Bluesky."""
        return "bluesky"

    @property
    def max_text_len(self) -> int:
        """Bluesky supports 300 characters."""
        return 300

    @property
    def max_images(self) -> int:
        """Bluesky supports up to 4 images per post."""
        return 4

    @property
    def supported_media_types(self) -> Optional[List[str]]:
        """Bluesky supports common image formats."""
        return ["image/jpeg", "image/png", "image/webp"]

    def __init__(self):
        self.base_url = "https://bsky.social"
        self.session = None
        self.access_jwt = None
        self.refresh_jwt = None
        self.did = None

    async def authenticate(self) -> bool:
        """Authenticate with Bluesky using username/password"""
        username = os.getenv("BLUESKY_USERNAME")
        password = os.getenv("BLUESKY_PASSWORD")

        if not username or not password:
            logger.error(
                "BLUESKY_USERNAME and BLUESKY_PASSWORD environment variables required"
            )
            return False

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/xrpc/com.atproto.server.createSession",
                    json={"identifier": username, "password": password},
                )

                if response.status_code == 200:
                    data = response.json()
                    self.access_jwt = data["accessJwt"]
                    self.refresh_jwt = data["refreshJwt"]
                    self.did = data["did"]
                    logger.info(f"Authenticated to Bluesky as {username}")
                    return True
                else:
                    logger.error(
                        f"Bluesky authentication failed: {response.status_code} {response.text}"
                    )
                    return False

        except Exception as e:
            logger.error(f"Error authenticating with Bluesky: {e}")
            return False

    async def post_text(self, text: str) -> bool:
        """Post text content to Bluesky"""
        if not self.access_jwt:
            if not await self.authenticate():
                return False

        try:
            # Build hashtag facets so hashtags are clickable
            facets = []
            for m in re.finditer(r"(?<!\w)#([A-Za-z0-9_]+)", text):
                tag = m.group(1)
                start_byte = len(text[: m.start()].encode("utf-8"))
                end_byte = len(text[: m.end()].encode("utf-8"))
                facets.append(
                    {
                        "index": {"byteStart": start_byte, "byteEnd": end_byte},
                        "features": [
                            {"$type": "app.bsky.richtext.facet#tag", "tag": tag}
                        ],
                    }
                )

            record = {
                "$type": "app.bsky.feed.post",
                "text": text,
                "createdAt": datetime.now().isoformat() + "Z",
            }
            if facets:
                record["facets"] = facets

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/xrpc/com.atproto.repo.createRecord",
                    headers={
                        "Authorization": f"Bearer {self.access_jwt}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "repo": self.did,
                        "collection": "app.bsky.feed.post",
                        "record": record,
                    },
                )

                if response.status_code == 200:
                    logger.info(f"Successfully posted to Bluesky: {text[:50]}...")
                    return True
                else:
                    logger.error(
                        f"Failed to post to Bluesky: {response.status_code} {response.text}"
                    )
                    return False

        except Exception as e:
            logger.error(f"Error posting to Bluesky: {e}")
            return False

    def compress_image(self, image_data: bytes, max_size_kb: int = 950) -> bytes:
        """Compress image to stay under size limit"""
        try:
            # Open image
            img = Image.open(io.BytesIO(image_data))

            # Convert to RGB if necessary (for JPEG)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")

            # Start with quality 85
            quality = 85

            while quality > 10:
                # Compress image
                output = io.BytesIO()
                img.save(output, format="JPEG", quality=quality, optimize=True)
                compressed_data = output.getvalue()

                # Check size
                size_kb = len(compressed_data) / 1024
                if size_kb <= max_size_kb:
                    logger.info(
                        f"Compressed image from {len(image_data) / 1024:.1f}KB to {size_kb:.1f}KB (quality={quality})"
                    )
                    return compressed_data

                # Reduce quality and try again
                quality -= 10

            # If still too large, resize the image
            logger.info("Still too large, resizing image")
            width, height = img.size
            img = img.resize(
                (int(width * 0.8), int(height * 0.8)), Image.Resampling.LANCZOS
            )

            output = io.BytesIO()
            img.save(output, format="JPEG", quality=75, optimize=True)
            return output.getvalue()

        except Exception as e:
            logger.error(f"Error compressing image: {e}")
            return image_data  # Return original if compression fails

    async def upload_image(
        self, image_data: bytes, filename: str
    ) -> Optional[Dict[str, Any]]:
        """Upload image to Bluesky and return blob reference"""
        if not self.access_jwt:
            if not await self.authenticate():
                return None

        try:
            # Check if image needs compression (Bluesky limit is ~1MB)
            size_kb = len(image_data) / 1024
            if size_kb > 950:  # Compress if larger than 950KB to be safe
                logger.info(f"Image {filename} is {size_kb:.1f}KB, compressing...")
                image_data = self.compress_image(image_data)

            # Determine MIME type
            mime_type, _ = mimetypes.guess_type(filename)
            if not mime_type or not mime_type.startswith("image/"):
                mime_type = "image/jpeg"  # Default fallback

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/xrpc/com.atproto.repo.uploadBlob",
                    headers={
                        "Authorization": f"Bearer {self.access_jwt}",
                        "Content-Type": mime_type,
                    },
                    content=image_data,
                )

                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"Successfully uploaded image: {filename}")
                    return data["blob"]
                else:
                    logger.error(
                        f"Failed to upload image: {response.status_code} {response.text}"
                    )
                    return None

        except Exception as e:
            logger.error(f"Error uploading image: {e}")
            return None

    async def post_with_images(self, text: str, image_urls: List[str]) -> bool:
        """Post text with images to Bluesky"""
        if not self.access_jwt:
            if not await self.authenticate():
                return False

        # Download and upload images
        image_blobs = []
        async with httpx.AsyncClient() as client:
            for url in image_urls:
                try:
                    # Download image from Discord
                    img_response = await client.get(url)
                    if img_response.status_code == 200:
                        filename = url.split("/")[-1].split("?")[
                            0
                        ]  # Extract filename from URL
                        blob = await self.upload_image(img_response.content, filename)
                        if blob:
                            image_blobs.append(
                                {
                                    "$type": "app.bsky.embed.images#image",
                                    "image": blob,
                                    "alt": f"Image from Discord: {filename}",
                                }
                            )
                except Exception as e:
                    logger.error(f"Error processing image {url}: {e}")

        if not image_blobs:
            # If no images could be processed, post text only
            return await self.post_text(text)

        # Create post with embedded images
        try:
            async with httpx.AsyncClient() as client:
                record = {
                    "$type": "app.bsky.feed.post",
                    "text": text,
                    "createdAt": datetime.now().isoformat() + "Z",
                }

                # Add hashtag facets so tags are clickable
                facets = []
                for m in re.finditer(r"(?<!\w)#([A-Za-z0-9_]+)", text):
                    tag = m.group(1)
                    start_byte = len(text[: m.start()].encode("utf-8"))
                    end_byte = len(text[: m.end()].encode("utf-8"))
                    facets.append(
                        {
                            "index": {"byteStart": start_byte, "byteEnd": end_byte},
                            "features": [
                                {"$type": "app.bsky.richtext.facet#tag", "tag": tag}
                            ],
                        }
                    )
                if facets:
                    record["facets"] = facets

                if image_blobs:
                    record["embed"] = {
                        "$type": "app.bsky.embed.images",
                        "images": image_blobs[:4],  # Bluesky supports max 4 images
                    }

                response = await client.post(
                    f"{self.base_url}/xrpc/com.atproto.repo.createRecord",
                    headers={
                        "Authorization": f"Bearer {self.access_jwt}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "repo": self.did,
                        "collection": "app.bsky.feed.post",
                        "record": record,
                    },
                )

                if response.status_code == 200:
                    logger.info(
                        f"Successfully posted to Bluesky with {len(image_blobs)} images"
                    )
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
        List notifications from Bluesky.

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2b.
        """
        raise NotImplementedError(
            "Notification support will be implemented in Phase 2b"
        )

    async def get_post_thread(self, uri: str, depth: int = 10) -> Dict[str, Any]:
        """
        Fetch the full post thread for context.

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2b.
        """
        raise NotImplementedError("Thread fetching will be implemented in Phase 2b")

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

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2b.
        """
        raise NotImplementedError("Reply support will be implemented in Phase 2b")


# Global Bluesky client instance
bluesky_client = BlueskyClient()
