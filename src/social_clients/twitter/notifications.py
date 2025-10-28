"""Notifications mixin for Twitter client."""

from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple


class NotificationsMixin:
    """Handles notifications and replies on Twitter."""

    async def list_notifications(
        self,
        cursor: Optional[str] = None,
        since: Optional[datetime] = None,
        types: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        List notifications from Twitter.

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2c.
        """
        raise NotImplementedError(
            "Notification support will be implemented in Phase 2c"
        )

    async def get_post_thread(self, uri: str, depth: int = 10) -> Dict[str, Any]:
        """
        Fetch the full post thread for context.

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2c.
        """
        raise NotImplementedError("Thread fetching will be implemented in Phase 2c")

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

        NOTE: This method is a stub for Phase 1. Full implementation in Phase 2c.
        """
        raise NotImplementedError("Reply support will be implemented in Phase 2c")
