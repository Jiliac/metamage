import os
import asyncio
import csv
import sys
from dotenv import load_dotenv
import httpx
from datetime import datetime
from typing import Optional, Tuple, List, Dict, Any


class BlueskySocialClient:
    """
    Standalone Bluesky client implementing the SocialClient protocol.
    No dependency on magebridge; code copied/replicated as needed.
    """

    def __init__(self):
        self.base_url = "https://bsky.social"
        self.access_jwt: Optional[str] = None
        self.refresh_jwt: Optional[str] = None
        self.did: Optional[str] = None
        self.handle: Optional[str] = None

    async def authenticate(self) -> bool:
        """Authenticate with Bluesky using username/password."""
        username = os.getenv("BLUESKY_USERNAME")
        password = os.getenv("BLUESKY_PASSWORD")
        if not username or not password:
            print(
                "BLUESKY_USERNAME and BLUESKY_PASSWORD environment variables required"
            )
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.base_url}/xrpc/com.atproto.server.createSession",
                    json={"identifier": username, "password": password},
                    timeout=30.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    self.access_jwt = data.get("accessJwt")
                    self.refresh_jwt = data.get("refreshJwt")
                    self.did = data.get("did")
                    # username may be handle if using email; attempt to resolve handle
                    self.handle = data.get("handle") or username
                    return True
                else:
                    print(
                        f"Bluesky authentication failed: {resp.status_code} {resp.text}"
                    )
                    return False
        except Exception as e:
            print(f"Error authenticating with Bluesky: {e}")
            return False

    async def _auth_headers(self) -> Dict[str, str]:
        if not self.access_jwt:
            ok = await self.authenticate()
            if not ok:
                raise RuntimeError("Bluesky authentication failed")
        return {"Authorization": f"Bearer {self.access_jwt}"}

    async def list_notifications(
        self, cursor: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """List notifications and normalize to SocialClient shape."""
        headers = await self._auth_headers()
        params: Dict[str, Any] = {"limit": 50}
        if cursor:
            params["cursor"] = cursor

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/xrpc/app.bsky.notification.listNotifications",
                headers=headers,
                params=params,
                timeout=30.0,
            )
            resp.raise_for_status()
            payload = resp.json()
            items = payload.get("notifications", []) or []
            next_cursor = payload.get("cursor")

        notifications: List[Dict[str, Any]] = []
        for it in items:
            reason = it.get("reason")
            # Skip notification types we don't handle
            if reason not in ("mention", "reply", "quote"):
                continue

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
                    "reason": reason,
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


async def main():
    load_dotenv()

    client = BlueskySocialClient()
    ok = await client.authenticate()
    if not ok:
        print("Failed to authenticate")
        return

    notifications, cursor = await client.list_notifications()

    # Print CSV header
    fieldnames = [
        "platform",
        "post_uri",
        "post_cid",
        "reason",
        "actor_id",
        "actor_handle",
        "indexed_at",
    ]
    writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames)
    writer.writeheader()

    # Print first 50 notifications as CSV
    for i, notif in enumerate(notifications[:50]):
        # Convert datetime to string if needed
        if isinstance(notif.get("indexed_at"), datetime):
            notif["indexed_at"] = notif["indexed_at"].isoformat()

        # Only write the fields we want
        row = {field: notif.get(field, "") for field in fieldnames}
        writer.writerow(row)


if __name__ == "__main__":
    asyncio.run(main())
