from typing import Protocol, Optional, Tuple, List, Dict, Any


class SocialClient(Protocol):
    async def list_notifications(
        self, cursor: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        Return (notifications, next_cursor). Each notification dict should normalize:
        {
            'platform': str,              # 'bluesky', 'twitter', ...
            'post_uri': str,
            'post_cid': str | None,
            'reason': str,                # mention|reply|quote|...
            'actor_id': str | None,       # DID/user id
            'actor_handle': str | None,
            'text': str | None,
            'indexed_at': 'ISO-8601 string' | datetime,
            # Optional hints (can be filled after get_post_thread)
            'root_uri': str | None,
            'root_cid': str | None,
            'parent_uri': str | None,
            'parent_cid': str | None,
        }
        """
        ...

    async def get_post_thread(self, uri: str, depth: int = 10) -> Dict[str, Any]:
        """Return platform-native thread JSON (opaque to caller)."""
        ...

    async def reply(
        self,
        text: str,
        parent_uri: str,
        parent_cid: Optional[str],
        root_uri: str,
        root_cid: Optional[str],
    ) -> str:
        """Create a reply and return the created post URI (or ID)."""
        ...
