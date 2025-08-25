import os
import httpx
from datetime import datetime
from typing import Optional, List, Dict, Any
import mimetypes

from .logger import logger


class BlueskyClient:
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
                        "record": {
                            "$type": "app.bsky.feed.post",
                            "text": text,
                            "createdAt": datetime.now().isoformat() + "Z",
                        },
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

    async def upload_image(
        self, image_data: bytes, filename: str
    ) -> Optional[Dict[str, Any]]:
        """Upload image to Bluesky and return blob reference"""
        if not self.access_jwt:
            if not await self.authenticate():
                return None

        try:
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


# Global Bluesky client instance
bluesky_client = BlueskyClient()
