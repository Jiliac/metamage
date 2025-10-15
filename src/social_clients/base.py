from typing import Protocol, Optional, Tuple, List, Dict, Any
from datetime import datetime


class SocialClient(Protocol):
    """
    Unified social client protocol supporting both posting (magebridge) and
    notifications/replies (socialbot).

    Notes:
    - Capabilities: expose max_text_len/max_images/supported_media_types so callers don't hardcode limits.
    - Error handling: implementations SHOULD raise exceptions on transport or HTTP 4xx/5xx errors;
      boolean returns are reserved for soft, non-exceptional failures.
    - Normalization: list_notifications() MUST normalize `indexed_at` to a timezone-aware UTC datetime.
      Implementations may ignore `since`/`types` filters if unsupported.
    """

    # Identity
    @property
    def platform_name(self) -> str:
        """Short platform identifier, e.g. 'bluesky' or 'twitter'."""
        ...

    # Capabilities (to avoid hardcoding limits elsewhere)
    @property
    def max_text_len(self) -> int:
        """Maximum text length supported by the platform (e.g., 300 for Bluesky, 280 for Twitter)."""
        ...

    @property
    def max_images(self) -> int:
        """Maximum number of images supported in a single post."""
        ...

    @property
    def supported_media_types(self) -> Optional[List[str]]:
        """List of supported image MIME types (e.g., ['image/jpeg','image/png']) or None if unrestricted/unknown."""
        ...

    # Authentication
    async def authenticate(self) -> bool:
        """Authenticate the client. Implementations SHOULD raise on auth/transport errors."""
        ...

    # Posting (Magebridge)
    async def post_text(self, text: str) -> bool:
        """
        Post a text-only status.
        Implementations SHOULD raise on transport/HTTP errors; return False only for soft failures.
        """
        ...

    async def post_with_images(self, text: str, image_urls: List[str]) -> bool:
        """
        Post a status with images referenced by URLs.
        Implementations handle downloading/processing/uploading as needed.
        SHOULD raise on transport/HTTP errors; return False only for soft failures.
        """
        ...

    # Notifications (Socialbot) — signatures present; implementations may be added in Phase 2
    async def list_notifications(
        self,
        cursor: Optional[str] = None,
        since: Optional[datetime] = None,
        types: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        Return (notifications, next_cursor).

        Optional filters:
        - since: only notifications strictly after this UTC datetime (server-side if supported; otherwise ignored)
        - types: list of notification reasons to include (e.g., ['mention','reply','quote']); ignore if unsupported

        Each notification dict MUST normalize:
        {
            'platform': str,              # 'bluesky', 'twitter', ...
            'post_uri': str,
            'post_cid': str | None,       # CID for Bluesky; None for others
            'reason': str,                # 'mention'|'reply'|'quote'|...
            'actor_id': str | None,       # DID/user id
            'actor_handle': str | None,
            'text': str | None,
            'indexed_at': datetime,       # timezone-aware UTC datetime
            # Optional hints (can be filled after get_post_thread)
            'root_uri': str | None,
            'root_cid': str | None,
            'parent_uri': str | None,
            'parent_cid': str | None,
        }
        """
        ...

    async def get_post_thread(self, uri: str, depth: int = 10) -> Dict[str, Any]:
        """Return platform-native thread JSON (opaque to caller). SHOULD raise on transport/HTTP errors."""
        ...

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
        Create a reply and return the created post URI (or ID).
        link_url, if provided, should be embedded/faceted when the platform supports link metadata.
        SHOULD raise on transport/HTTP errors.
        """
        ...
