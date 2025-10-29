"""Notifications mixin for Twitter client."""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
import tweepy

logger = logging.getLogger("social_clients.twitter.notifications")


class NotificationsMixin:
    """Handles notifications and replies on Twitter."""

    async def list_notifications(
        self,
        cursor: Optional[str] = None,
        since: Optional[datetime] = None,
        types: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        List notifications (mentions) from Twitter.

        Rate limited: Free tier = 1 req/15min, Basic = 10 req/15min.
        Returns empty list if throttled to avoid hitting API limits.
        """
        # Check if we should throttle this poll
        should_throttle, wait_time = self._should_throttle_notifications_poll()
        if should_throttle:
            logger.info(
                f"Throttling Twitter notifications poll: {wait_time:.0f}s until next poll"
            )
            return [], None

        # Get authenticated user ID (cached)
        if self._me_cache is None:
            try:
                me = self.client_v2.get_me()
                self._me_cache = {"id": me.data.id, "username": me.data.username}
            except Exception as e:
                logger.error(f"Failed to get authenticated user: {e}")
                return [], None

        user_id = self._me_cache["id"]

        try:
            # Fetch mentions with user auth
            response = self.client_v2.get_users_mentions(
                id=user_id,
                max_results=10,
                pagination_token=cursor,
                tweet_fields=["created_at", "conversation_id", "in_reply_to_user_id"],
                expansions=["author_id"],
                user_fields=["username"],
                user_auth=True,
            )

            # Update last poll time on success
            self._last_notifications_poll = datetime.now(timezone.utc)

            if not response.data:
                logger.info("No Twitter mentions found")
                return [], None

            # Normalize to protocol format
            notifications: List[Dict[str, Any]] = []
            for tweet in response.data:
                # Get author info from includes
                author_username = None
                if response.includes and "users" in response.includes:
                    author = next(
                        (
                            u
                            for u in response.includes["users"]
                            if u.id == tweet.author_id
                        ),
                        None,
                    )
                    if author:
                        author_username = author.username

                notifications.append(
                    {
                        "platform": "twitter",
                        "post_uri": str(tweet.id),
                        "post_cid": None,  # Twitter doesn't use CIDs
                        "reason": "mention",  # Twitter API only returns mentions
                        "actor_id": str(tweet.author_id),
                        "actor_handle": author_username,
                        "text": tweet.text,
                        "indexed_at": tweet.created_at
                        if tweet.created_at
                        else datetime.now(timezone.utc),
                        # Twitter-specific fields
                        "root_uri": str(tweet.conversation_id)
                        if tweet.conversation_id
                        else None,
                        "root_cid": None,
                        "parent_uri": str(tweet.id),  # Reply to the mention itself
                        "parent_cid": None,
                    }
                )

            next_token = response.meta.get("next_token") if response.meta else None
            logger.info(f"Fetched {len(notifications)} Twitter mentions")
            return notifications, next_token

        except tweepy.errors.TooManyRequests as e:
            logger.warning(f"Hit Twitter rate limit (429): {e}")
            # Apply backoff
            self._last_notifications_poll = datetime.now(timezone.utc)
            self._poll_interval = self._backoff_seconds
            logger.info(f"Applied {self._backoff_seconds}s backoff after 429")
            return [], None

        except Exception as e:
            logger.error(f"Error fetching Twitter mentions: {e}")
            return [], None

    async def get_post_thread(self, uri: str, depth: int = 10) -> Dict[str, Any]:
        """
        Fetch the full post thread for context.

        Twitter v2 API doesn't provide easy thread traversal.
        Returns empty dict - socialbot processor handles this gracefully.
        """
        logger.debug(
            f"get_post_thread called for {uri} - returning empty (not supported)"
        )
        return {}

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
        Post a reply to a given tweet.

        Args:
            text: Reply text
            parent_uri: Tweet ID to reply to
            parent_cid: Ignored (Twitter doesn't use CIDs)
            root_uri: Ignored (Twitter handles threading automatically)
            root_cid: Ignored (Twitter doesn't use CIDs)
            link_url: Ignored (Twitter doesn't support rich text facets)

        Returns:
            Created tweet ID as string
        """
        try:
            response = self.client_v2.create_tweet(
                text=text, in_reply_to_tweet_id=parent_uri
            )

            tweet_id = str(response.data["id"])
            logger.info(f"Posted Twitter reply: {tweet_id}")
            return tweet_id

        except Exception as e:
            logger.error(f"Error posting Twitter reply: {e}")
            raise
