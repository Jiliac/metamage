import os
import asyncio
import httpx
from datetime import datetime, timezone
from typing import Optional, Tuple, List, Dict, Any

from .client_base import SocialClient


class BlueskySocialClient(SocialClient):
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

    async def _request(
        self,
        method: str,
        path: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        backoff_ms: int = 500,
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        last_exc: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.request(
                        method,
                        url,
                        headers=headers,
                        params=params,
                        json=json_body,
                        timeout=timeout,
                    )
                # Retry on 5xx and on 429/408; otherwise raise if error
                if resp.status_code >= 500 or resp.status_code in (429, 408):
                    if attempt < max_retries:
                        await asyncio.sleep(backoff_ms / 1000.0)
                        continue
                resp.raise_for_status()
                return resp
            except (httpx.TransportError, httpx.TimeoutException) as e:
                last_exc = e
                if attempt < max_retries:
                    await asyncio.sleep(backoff_ms / 1000.0)
                    continue
                raise
            except httpx.HTTPStatusError as e:
                last_exc = e
                if (
                    attempt < max_retries
                    and e.response is not None
                    and (
                        500 <= e.response.status_code < 600
                        or e.response.status_code in (429, 408)
                    )
                ):
                    await asyncio.sleep(backoff_ms / 1000.0)
                    continue
                raise
        if last_exc:
            raise last_exc
        raise RuntimeError("Unknown HTTP request failure")

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
            resp = await self._request(
                "POST",
                "/xrpc/com.atproto.server.createSession",
                json_body={"identifier": username, "password": password},
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
                print(f"Bluesky authentication failed: {resp.status_code} {resp.text}")
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
