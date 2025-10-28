"""Posting mixin for Bluesky client."""

import os
import re
import io
import logging
import mimetypes
from datetime import datetime
from typing import Optional, List, Dict, Any
from PIL import Image
import httpx

logger = logging.getLogger("social_clients.bluesky.posting")


class PostingMixin:
    """Handles posting text and images to Bluesky."""

    async def post_text(self, text: str) -> bool:
        """Post text content to Bluesky."""
        headers = await self._auth_headers()

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

            await self._request(
                "POST",
                "/xrpc/com.atproto.repo.createRecord",
                headers={**headers, "Content-Type": "application/json"},
                json_body={
                    "repo": self.did,
                    "collection": "app.bsky.feed.post",
                    "record": record,
                },
                timeout=30.0,
            )

            logger.info(f"Successfully posted to Bluesky: {text[:50]}...")
            return True

        except Exception as e:
            logger.error(f"Error posting to Bluesky: {e}")
            return False

    def compress_image(self, image_data: bytes, max_size_kb: int = 950) -> bytes:
        """Compress image to stay under size limit."""
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
        """Upload image to Bluesky and return blob reference."""
        headers = await self._auth_headers()

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

            resp = await self._request(
                "POST",
                "/xrpc/com.atproto.repo.uploadBlob",
                headers={
                    **headers,
                    "Content-Type": mime_type,
                },
                content=image_data,
                timeout=60.0,
            )

            data = resp.json()
            logger.info(f"Successfully uploaded image: {filename}")
            return data["blob"]

        except Exception as e:
            logger.error(f"Error uploading image: {e}")
            return None

    async def post_with_images(self, text: str, image_urls: List[str]) -> bool:
        """Post text with images to Bluesky."""
        headers = await self._auth_headers()

        # Download and upload images
        image_blobs = []
        for url in image_urls[:4]:  # Bluesky supports max 4 images
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

                blob = await self.upload_image(image_data, filename)
                if blob:
                    image_blobs.append(
                        {
                            "$type": "app.bsky.embed.images#image",
                            "image": blob,
                            "alt": f"Image: {filename}",
                        }
                    )
            except Exception as e:
                logger.error(f"Error processing image {url}: {e}")

        if not image_blobs:
            # If no images could be processed, post text only
            return await self.post_text(text)

        # Create post with embedded images
        try:
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

            record = {
                "$type": "app.bsky.feed.post",
                "text": text,
                "createdAt": datetime.now().isoformat() + "Z",
            }

            if facets:
                record["facets"] = facets

            if image_blobs:
                record["embed"] = {
                    "$type": "app.bsky.embed.images",
                    "images": image_blobs[:4],  # Bluesky supports max 4 images
                }

            await self._request(
                "POST",
                "/xrpc/com.atproto.repo.createRecord",
                headers={**headers, "Content-Type": "application/json"},
                json_body={
                    "repo": self.did,
                    "collection": "app.bsky.feed.post",
                    "record": record,
                },
                timeout=30.0,
            )

            logger.info(
                f"Successfully posted to Bluesky with {len(image_blobs)} images"
            )
            return True

        except Exception as e:
            logger.error(f"Error posting with images: {e}")
            return False
