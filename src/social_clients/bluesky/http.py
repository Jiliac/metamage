"""HTTP request handling with retry logic for Bluesky client."""

import asyncio
import httpx
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("social_clients.bluesky.http")


class HTTPMixin:
    """Handles HTTP requests with retry logic, backoff, and auto-refresh."""

    def __init__(self):
        self.base_url = "https://bsky.social"

    async def _request(
        self,
        method: str,
        path: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        content: Optional[bytes] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        backoff_ms: int = 500,
        _auth_retry: bool = True,
    ) -> httpx.Response:
        """
        Make HTTP request with retry logic and auto token refresh.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: API path (e.g., "/xrpc/...")
            headers: Optional headers dict
            params: Optional query parameters
            json_body: Optional JSON body
            content: Optional raw bytes content
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
            backoff_ms: Backoff delay in milliseconds
            _auth_retry: Whether to retry with token refresh on 401 (internal)

        Returns:
            httpx.Response object

        Raises:
            httpx.HTTPStatusError: On HTTP errors after all retries
            httpx.TransportError: On transport errors after all retries
        """
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
                        content=content,
                        timeout=timeout,
                    )

                # Retry on 5xx and on 429/408; otherwise raise if error
                if resp.status_code >= 500 or resp.status_code in (429, 408):
                    if attempt < max_retries:
                        delay = backoff_ms / 1000.0
                        logger.warning(
                            f"Retrying {method} {path} after status {resp.status_code} "
                            f"(attempt {attempt}/{max_retries}) in {delay:.2f}s"
                        )
                        await asyncio.sleep(delay)
                        continue

                resp.raise_for_status()
                return resp

            except (httpx.TransportError, httpx.TimeoutException) as e:
                last_exc = e
                if attempt < max_retries:
                    delay = backoff_ms / 1000.0
                    logger.warning(
                        f"Retrying {method} {path} after transport/timeout error: {e} "
                        f"(attempt {attempt}/{max_retries}) in {delay:.2f}s"
                    )
                    await asyncio.sleep(delay)
                    continue
                raise

            except httpx.HTTPStatusError as e:
                last_exc = e

                # Handle auth errors with token refresh (400 or 401)
                if (
                    _auth_retry
                    and e.response is not None
                    and e.response.status_code in (400, 401)
                    and headers
                    and "Authorization" in headers
                ):
                    logger.info(
                        f"Got {e.response.status_code}, attempting to refresh session"
                    )
                    refresh_ok = await self.refresh_session()
                    if refresh_ok:
                        # Update headers with new token and retry once
                        new_headers = headers.copy()
                        new_headers["Authorization"] = f"Bearer {self.access_jwt}"
                        return await self._request(
                            method,
                            path,
                            headers=new_headers,
                            params=params,
                            json_body=json_body,
                            content=content,
                            timeout=timeout,
                            max_retries=max_retries,
                            backoff_ms=backoff_ms,
                            _auth_retry=False,  # Prevent infinite recursion
                        )

                # Retry on 5xx or 429/408
                if (
                    attempt < max_retries
                    and e.response is not None
                    and (
                        500 <= e.response.status_code < 600
                        or e.response.status_code in (429, 408)
                    )
                ):
                    delay = backoff_ms / 1000.0
                    logger.warning(
                        f"Retrying {method} {path} after HTTPStatusError {e.response.status_code} "
                        f"(attempt {attempt}/{max_retries}) in {delay:.2f}s"
                    )
                    await asyncio.sleep(delay)
                    continue
                raise

        if last_exc:
            raise last_exc
        raise RuntimeError("Unknown HTTP request failure")
