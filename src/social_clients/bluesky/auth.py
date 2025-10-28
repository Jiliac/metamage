"""Authentication mixin for Bluesky client."""

import os
import logging
from typing import Dict

logger = logging.getLogger("social_clients.bluesky.auth")


class AuthMixin:
    """Handles Bluesky authentication and session management."""

    def __init__(self):
        self.access_jwt = None
        self.refresh_jwt = None
        self.did = None
        self.handle = None

    async def authenticate(self) -> bool:
        """Authenticate with Bluesky using username/password."""
        username = os.getenv("BLUESKY_USERNAME")
        password = os.getenv("BLUESKY_PASSWORD")

        if not username or not password:
            logger.error(
                "BLUESKY_USERNAME and BLUESKY_PASSWORD environment variables required"
            )
            return False

        try:
            resp = await self._request(
                "POST",
                "/xrpc/com.atproto.server.createSession",
                json_body={"identifier": username, "password": password},
                timeout=30.0,
                _auth_retry=False,  # Don't retry auth on auth failure
            )
            data = resp.json()
            self.access_jwt = data.get("accessJwt")
            self.refresh_jwt = data.get("refreshJwt")
            self.did = data.get("did")
            self.handle = data.get("handle") or username
            logger.info(f"Authenticated to Bluesky as {username}")
            return True

        except Exception as e:
            logger.error(f"Error authenticating with Bluesky: {e}")
            return False

    async def refresh_session(self) -> bool:
        """Refresh the access token using the refresh token."""
        if not self.refresh_jwt:
            logger.warning(
                "No refresh token available, attempting full re-authentication"
            )
            return await self.authenticate()

        try:
            resp = await self._request(
                "POST",
                "/xrpc/com.atproto.server.refreshSession",
                headers={"Authorization": f"Bearer {self.refresh_jwt}"},
                timeout=30.0,
                _auth_retry=False,  # Don't retry refresh on failure
            )
            data = resp.json()
            self.access_jwt = data.get("accessJwt")
            self.refresh_jwt = data.get("refreshJwt")
            logger.info("Successfully refreshed Bluesky session")
            return True

        except Exception as e:
            logger.warning(
                f"Failed to refresh session: {e}, attempting full re-authentication"
            )
            return await self.authenticate()

    async def _auth_headers(self) -> Dict[str, str]:
        """Get authentication headers, authenticating if necessary."""
        if not self.access_jwt:
            ok = await self.authenticate()
            if not ok:
                raise RuntimeError("Bluesky authentication failed")
        return {"Authorization": f"Bearer {self.access_jwt}"}
