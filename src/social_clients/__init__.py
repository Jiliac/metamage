from .base import SocialClient
from .bluesky import BlueskyClient
from .twitter import TwitterClient
from .multiplexer import SocialMultiplexer

# Keep backward compatibility - create a global instance for legacy code
from .bluesky.client import BlueskyClient as _BlueskyClientClass

bluesky_client = _BlueskyClientClass()

__all__ = [
    "SocialClient",
    "BlueskyClient",
    "TwitterClient",
    "SocialMultiplexer",
    "bluesky_client",
]
