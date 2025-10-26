"""
Social client multiplexer for posting to multiple platforms simultaneously.
"""

import asyncio
import logging
from typing import List, Dict, Any

from .base import SocialClient

logger = logging.getLogger("social_clients.multiplexer")


class SocialMultiplexer:
    """
    Multiplexer that posts to multiple social platforms simultaneously.

    Implements the same interface as individual SocialClient implementations,
    but distributes calls across all registered clients.
    """

    def __init__(self, clients: List[SocialClient]):
        """
        Initialize multiplexer with a list of social clients.

        Args:
            clients: List of SocialClient instances (BlueskyClient, TwitterClient, etc.)
        """
        self.clients = clients
        logger.info(
            f"Initialized multiplexer with {len(clients)} clients: {[c.platform_name for c in clients]}"
        )

    async def authenticate(self) -> Dict[str, bool]:
        """
        Authenticate all clients.

        Returns:
            Dict mapping platform_name to authentication success status
        """
        results = {}
        tasks = []

        for client in self.clients:
            tasks.append(client.authenticate())

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for client, result in zip(self.clients, responses):
            if isinstance(result, Exception):
                logger.error(
                    f"Authentication failed for {client.platform_name}: {result}"
                )
                results[client.platform_name] = False
            else:
                results[client.platform_name] = result

        return results

    async def post_text(self, text: str) -> Dict[str, bool]:
        """
        Post text to all platforms.

        Args:
            text: Text content to post

        Returns:
            Dict mapping platform_name to post success status
        """
        results = {}
        tasks = []

        for client in self.clients:
            tasks.append(client.post_text(text))

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for client, result in zip(self.clients, responses):
            if isinstance(result, Exception):
                logger.error(f"Post failed for {client.platform_name}: {result}")
                results[client.platform_name] = False
            else:
                results[client.platform_name] = result

        success_count = sum(1 for v in results.values() if v)
        logger.info(
            f"Posted text to {success_count}/{len(self.clients)} platforms: {results}"
        )

        return results

    async def post_with_images(
        self, text: str, image_urls: List[str]
    ) -> Dict[str, bool]:
        """
        Post text with images to all platforms.

        Args:
            text: Text content to post
            image_urls: List of image URLs or local file paths

        Returns:
            Dict mapping platform_name to post success status
        """
        results = {}
        tasks = []

        for client in self.clients:
            tasks.append(client.post_with_images(text, image_urls))

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for client, result in zip(self.clients, responses):
            if isinstance(result, Exception):
                logger.error(
                    f"Post with images failed for {client.platform_name}: {result}"
                )
                results[client.platform_name] = False
            else:
                results[client.platform_name] = result

        success_count = sum(1 for v in results.values() if v)
        logger.info(
            f"Posted with images to {success_count}/{len(self.clients)} platforms: {results}"
        )

        return results

    def get_platform_limits(self) -> Dict[str, Dict[str, Any]]:
        """
        Get platform-specific limits for all clients.

        Returns:
            Dict mapping platform_name to dict of limits (max_text_len, max_images, etc.)
        """
        limits = {}
        for client in self.clients:
            limits[client.platform_name] = {
                "max_text_len": client.max_text_len,
                "max_images": client.max_images,
                "supported_media_types": client.supported_media_types,
            }
        return limits

    def get_most_restrictive_limits(self) -> Dict[str, Any]:
        """
        Get the most restrictive limits across all platforms.
        Useful for pre-validating content before posting.

        Returns:
            Dict with most restrictive max_text_len and max_images
        """
        if not self.clients:
            return {"max_text_len": 0, "max_images": 0}

        return {
            "max_text_len": min(c.max_text_len for c in self.clients),
            "max_images": min(c.max_images for c in self.clients),
        }
