"""Unified Bluesky client implementing the SocialClient protocol."""

from typing import Optional, List

from .http import HTTPMixin
from .auth import AuthMixin
from .posting import PostingMixin
from .notifications import NotificationsMixin


class BlueskyClient(HTTPMixin, AuthMixin, PostingMixin, NotificationsMixin):
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
        # Initialize all mixins
        HTTPMixin.__init__(self)
        AuthMixin.__init__(self)
        # PostingMixin and NotificationsMixin don't have __init__
