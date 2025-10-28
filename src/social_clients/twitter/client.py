"""Unified Twitter client implementing the SocialClient protocol."""

from typing import Optional, List

from .auth import AuthMixin
from .posting import PostingMixin
from .notifications import NotificationsMixin


class TwitterClient(AuthMixin, PostingMixin, NotificationsMixin):
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
        # Initialize all mixins
        AuthMixin.__init__(self)
        # PostingMixin and NotificationsMixin don't have __init__
