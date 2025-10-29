"""Authentication mixin for Twitter client."""

import os
import logging
from typing import Optional, List, Tuple, Dict, Any
from datetime import datetime, timezone
import tweepy

logger = logging.getLogger("social_clients.twitter.auth")


class AuthMixin:
    """Handles Twitter authentication using tweepy."""

    def __init__(self):
        self.api_key = os.getenv("TWITTER_API_KEY")
        self.api_secret = os.getenv("TWITTER_API_SECRET")
        self.access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        self.access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")

        # Initialize tweepy clients (will be set during authenticate)
        self.api_v1: Optional[tweepy.API] = None
        self.client_v2: Optional[tweepy.Client] = None

        # Rate limiting for notifications polling (Phase 2c)
        self._last_notifications_poll: Optional[datetime] = None
        self._poll_interval = int(os.getenv("TWITTER_POLL_INTERVAL_SECONDS", "900"))
        self._backoff_seconds = int(
            os.getenv("TWITTER_RATE_LIMIT_BACKOFF_SECONDS", "300")
        )

        # Cache for authenticated user info
        self._me_cache: Optional[Dict[str, Any]] = None

    def _check_credentials(self) -> List[str]:
        """Check if all required credentials are present."""
        missing = []
        if not self.api_key:
            missing.append("TWITTER_API_KEY")
        if not self.api_secret:
            missing.append("TWITTER_API_SECRET")
        if not self.access_token:
            missing.append("TWITTER_ACCESS_TOKEN")
        if not self.access_token_secret:
            missing.append("TWITTER_ACCESS_TOKEN_SECRET")
        return missing

    async def authenticate(self) -> bool:
        """
        Authenticate with Twitter.
        Initializes both v1.1 and v2 API clients using tweepy.
        """
        missing = self._check_credentials()
        if missing:
            logger.error(f"Missing Twitter credentials: {', '.join(missing)}")
            return False

        try:
            # Initialize v1.1 API for media upload
            auth = tweepy.OAuth1UserHandler(
                self.api_key,
                self.api_secret,
            )
            auth.set_access_token(self.access_token, self.access_token_secret)
            self.api_v1 = tweepy.API(auth)

            # Initialize v2 API for tweeting
            self.client_v2 = tweepy.Client(
                consumer_key=self.api_key,
                consumer_secret=self.api_secret,
                access_token=self.access_token,
                access_token_secret=self.access_token_secret,
            )

            logger.info("Twitter credentials verified and clients initialized")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize Twitter clients: {e}")
            return False

    def _should_throttle_notifications_poll(self) -> Tuple[bool, Optional[float]]:
        """
        Check if we should throttle notification polling due to rate limits.

        Returns:
            (should_throttle, seconds_to_wait)
        """
        if self._last_notifications_poll is None:
            return False, None

        now = datetime.now(timezone.utc)
        elapsed = (now - self._last_notifications_poll).total_seconds()
        required = self._poll_interval

        if elapsed < required:
            wait_time = required - elapsed
            logger.debug(
                f"Throttling notifications poll: {elapsed:.0f}s elapsed, {wait_time:.0f}s remaining"
            )
            return True, wait_time

        return False, None
