"""Notifications mixin for Bluesky client."""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple


class NotificationsMixin:
    """Handles notifications and replies on Bluesky."""

    async def list_notifications(
        self,
        cursor: Optional[str] = None,
        since: Optional[datetime] = None,
        types: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """List notifications and normalize to SocialClient shape."""
        headers = await self._auth_headers()
        params: Dict[str, Any] = {"limit": 50}
        if cursor:
            params["cursor"] = cursor

        resp = await self._request(
            "GET",
            "/xrpc/app.bsky.notification.listNotifications",
            headers=headers,
            params=params,
            timeout=30.0,
        )
        payload = resp.json()
        items = payload.get("notifications", []) or []
        next_cursor = payload.get("cursor")

        notifications: List[Dict[str, Any]] = []
        for it in items:
            author = it.get("author") or {}
            indexed_at = it.get("indexedAt")
            # Normalize ISO timestamp to datetime if possible
            try:
                dt = (
                    datetime.fromisoformat(indexed_at.replace("Z", "+00:00"))
                    if isinstance(indexed_at, str)
                    else None
                )
            except Exception:
                dt = None

            notifications.append(
                {
                    "platform": "bluesky",
                    "post_uri": it.get("uri"),
                    "post_cid": it.get("cid"),
                    "reason": it.get("reason"),
                    "actor_id": author.get("did"),
                    "actor_handle": author.get("handle"),
                    "text": None,  # we will fetch text via get_post_thread
                    "indexed_at": dt or indexed_at,
                    # Hints left None; to be filled after get_post_thread
                    "root_uri": None,
                    "root_cid": None,
                    "parent_uri": None,
                    "parent_cid": None,
                }
            )

        return notifications, next_cursor

    async def get_post_thread(self, uri: str, depth: int = 10) -> Dict[str, Any]:
        """Fetch the full post thread for context."""
        headers = await self._auth_headers()
        params = {"uri": uri, "depth": depth}
        resp = await self._request(
            "GET",
            "/xrpc/app.bsky.feed.getPostThread",
            headers=headers,
            params=params,
            timeout=30.0,
        )
        return resp.json()

    async def reply(
        self,
        text: str,
        parent_uri: str,
        parent_cid: Optional[str],
        root_uri: str,
        root_cid: Optional[str],
        link_url: Optional[str] = None,
    ) -> str:
        """Post a reply to a given parent/root. Returns created post URI."""
        headers = await self._auth_headers()
        created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        # Create rich text facet for the provided link URL
        facets = []
        if link_url and link_url in text:
            # Find where the URL appears in the text
            url_start = text.rfind(link_url)  # Use rfind to get the last occurrence
            if url_start != -1:
                start_byte = len(text[:url_start].encode("utf-8"))
                end_byte = len(text[: url_start + len(link_url)].encode("utf-8"))

                facets.append(
                    {
                        "index": {"byteStart": start_byte, "byteEnd": end_byte},
                        "features": [
                            {
                                "$type": "app.bsky.richtext.facet#link",
                                "uri": link_url,
                            }
                        ],
                    }
                )

        record: Dict[str, Any] = {
            "$type": "app.bsky.feed.post",
            "text": text,
            "createdAt": created_at,
            "reply": {
                "root": {"uri": root_uri, "cid": root_cid}
                if root_cid
                else {"uri": root_uri},
                "parent": {"uri": parent_uri, "cid": parent_cid}
                if parent_cid
                else {"uri": parent_uri},
            },
        }

        # Add facets if we found any URLs
        if facets:
            record["facets"] = facets

        resp = await self._request(
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
        data = resp.json()
        return data.get("uri")
