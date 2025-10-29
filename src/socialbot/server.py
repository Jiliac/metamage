#!/usr/bin/env python3
"""
SocialBot server: polls Bluesky notifications, runs the MTG agent,
summarizes to <=250 chars, and replies in-thread.
"""

import os
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple

from dotenv import load_dotenv

from sqlalchemy import and_

from ..ops_model.base import get_ops_session_factory
from ..ops_model import Base  # type: ignore
from ..ops_model.base import get_ops_engine
from ..ops_model.models import Pass
from ..ops_model.chat_models import ChatSession  # noqa: F401  # ensure table exists
from ..ops_model.models import SocialMessage  # noqa: F401  # ensure table exists
from ..ops_model.models import DiscordPost  # noqa: F401  # ensure table exists
from ..ops_model.models import FocusedChannel  # noqa: F401  # ensure table exists
from ..ops_model.models import SocialNotification
from ..social_clients import BlueskyClient, TwitterClient
from .processor import process_one_notification

logger = logging.getLogger("socialbot.server")
logging.basicConfig(level=logging.INFO)


def ensure_tables():
    """Ensure ops DB has all tables created."""
    engine = get_ops_engine()
    Base.metadata.create_all(engine)


def _get_or_create_pass(session, pass_type: str) -> Pass:
    p = (
        session.query(Pass)
        .filter_by(pass_type=pass_type)
        .order_by(Pass.start_time.desc())
        .first()
    )
    if p is None:
        p = Pass(
            pass_type=pass_type, start_time=datetime.now(timezone.utc), success=False
        )
        session.add(p)
        session.commit()
    return p


def _iso_now() -> datetime:
    return datetime.now(timezone.utc)


def _extract_parent_root_from_thread(
    thread_json: dict, target_uri: str
) -> Tuple[Optional[Tuple[str, Optional[str]]], Optional[Tuple[str, Optional[str]]]]:
    """
    From app.bsky.feed.getPostThread result, find parent and root (uri, cid)
    for the node matching target_uri.
    """

    def find_node(node: dict, root: Optional[dict]) -> Optional[dict]:
        if not node:
            return None
        post = node.get("post") or {}
        if post.get("uri") == target_uri:
            return {"node": node, "root": root or node}
        # Search parent chain
        parent = node.get("parent")
        if parent and isinstance(parent, dict):
            res = find_node(parent, root or parent)
            if res:
                return res
        # Search replies
        for child in node.get("replies") or []:
            res = find_node(child, root or node)
            if res:
                return res
        return None

    root_obj = thread_json.get("thread")
    found = find_node(root_obj, None)
    if not found:
        return None, None

    node = found["node"]
    root = found["root"]

    # Parent is node.get("parent")
    parent = node.get("parent")
    parent_uri = None
    parent_cid = None
    if isinstance(parent, dict):
        ppost = parent.get("post") or {}
        parent_uri = ppost.get("uri")
        parent_cid = ppost.get("cid")

    # Root is topmost root
    rpost = (root.get("post") if isinstance(root, dict) else {}) or {}
    root_uri = rpost.get("uri")
    root_cid = rpost.get("cid")

    parent_tuple = (parent_uri, parent_cid) if parent_uri else None
    root_tuple = (root_uri, root_cid) if root_uri else None
    return parent_tuple, root_tuple


async def poll_and_upsert(session, client, last_processed_time, platform: str):
    """Poll notifications and upsert into DB. Returns (seen_count, latest_indexed, actually_polled)."""
    (
        notifs,
        _,
        actually_polled,
    ) = await client.list_notifications()  # Always fetch latest, no cursor

    messages_processed = 0
    latest_indexed = None

    def _parse_indexed_at(val):
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except Exception:
                return None
        return None

    for n in notifs:
        actor_id = n.get("actor_id")
        client_did = getattr(client, "did", None)
        is_self = bool(client_did and actor_id == client_did)
        idx_at = _parse_indexed_at(n.get("indexed_at"))
        reason = n.get("reason")

        # Skip notification types we don't handle
        if reason not in ("mention", "reply"):
            continue

        # Skip notifications older than our last processed time
        if last_processed_time and idx_at:
            # Ensure last_processed_time is timezone-aware
            if last_processed_time.tzinfo is None:
                last_processed_time = last_processed_time.replace(tzinfo=timezone.utc)
            if idx_at <= last_processed_time:
                continue

        existing = (
            session.query(SocialNotification)
            .filter_by(
                platform=platform,
                post_uri=n.get("post_uri"),
                actor_id=actor_id,
                reason=n.get("reason"),
            )
            .first()
        )
        if existing:
            if idx_at and (
                existing.indexed_at is None
                or (
                    existing.indexed_at.replace(tzinfo=timezone.utc)
                    if existing.indexed_at.tzinfo is None
                    else existing.indexed_at
                )
                < idx_at
            ):
                existing.indexed_at = idx_at
            if not existing.text and n.get("text"):
                existing.text = n.get("text")
            if not existing.actor_handle and n.get("actor_handle"):
                existing.actor_handle = n.get("actor_handle")
            existing.is_self = is_self
        else:
            sn = SocialNotification(
                platform=platform,
                post_uri=n.get("post_uri"),
                post_cid=n.get("post_cid"),
                actor_id=actor_id,
                actor_handle=n.get("actor_handle"),
                reason=n.get("reason"),
                text=n.get("text"),
                indexed_at=idx_at,
                status="skipped" if is_self else "pending",
                is_self=is_self,
            )
            session.add(sn)

        messages_processed += 1
        if idx_at:
            latest_indexed = (
                idx_at if latest_indexed is None else max(latest_indexed, idx_at)
            )

    session.commit()
    return messages_processed, latest_indexed, actually_polled


def claim_next_pending(session, platform: str = "bluesky"):
    """Atomically claim the next pending notification. Returns the claimed row or None."""
    candidates = (
        session.query(SocialNotification)
        .filter(
            and_(
                SocialNotification.platform == platform,
                SocialNotification.status == "pending",
                SocialNotification.is_self.is_(False),
            )
        )
        .order_by(
            SocialNotification.indexed_at.asc().nullsfirst(),
            SocialNotification.created_at.asc(),
        )
        .limit(10)
        .all()
    )

    for cand in candidates:
        updated = (
            session.query(SocialNotification)
            .filter_by(id=cand.id, status="pending")
            .update(
                {
                    SocialNotification.status: "processing",
                    SocialNotification.attempts: SocialNotification.attempts + 1,
                },
                synchronize_session=False,
            )
        )
        session.commit()
        if updated == 1:
            return session.query(SocialNotification).filter_by(id=cand.id).first()

    return None


async def poll_and_process_once(
    client,
    platform: str,
    provider: str = "claude",
    max_to_process: Optional[int] = None,
) -> None:
    """
    Poll notifications once, upsert to DB, then process up to N pending notifications.
    N defaults to env SOCIALBOT_MAX_TO_PROCESS or 1.
    Only updates Pass record if actually_polled=True.
    """
    if max_to_process is None:
        try:
            max_to_process = int(os.getenv("SOCIALBOT_MAX_TO_PROCESS", "1"))
        except Exception:
            max_to_process = 1

    SessionFactory = get_ops_session_factory()
    session = SessionFactory()
    try:
        pass_type = f"{platform}_notifications"
        pass_rec = _get_or_create_pass(session, pass_type)
        last_processed = pass_rec.last_processed_time

        seen, latest_idx, actually_polled = await poll_and_upsert(
            session, client, last_processed, platform
        )

        # Only update pass record if we actually polled (not throttled)
        if actually_polled:
            pass_rec.last_processed_time = latest_idx or pass_rec.last_processed_time
            pass_rec.notes = None  # No longer using cursor
            pass_rec.messages_processed = (pass_rec.messages_processed or 0) + (
                seen or 0
            )
            pass_rec.end_time = _iso_now()
            pass_rec.success = True
            session.commit()
        else:
            logger.debug(f"Skipped {platform} pass update: throttled")

        # Process up to N pending notifications
        processed = 0
        for _ in range(max_to_process):
            notif = claim_next_pending(session, platform=platform)
            if not notif:
                break
            try:
                await process_one_notification(session, client, notif, provider)
                processed += 1
            except Exception as e:
                logger.exception("Unhandled error during notification processing")
                try:
                    notif.status = "error"
                    notif.error_message = str(e)
                    session.commit()
                except Exception:
                    session.rollback()

        if processed:
            logger.info(f"Processed {processed} pending notification(s).")

    except Exception as e:
        logger.exception(f"Error in poll_and_process_once: {e}")
        session.rollback()
    finally:
        session.close()


async def main():
    load_dotenv()
    ensure_tables()

    # Initialize available clients based on environment variables
    clients = []

    # Bluesky
    if os.getenv("BLUESKY_USERNAME") and os.getenv("BLUESKY_PASSWORD"):
        logger.info("Initializing Bluesky client...")
        bsky = BlueskyClient()
        if await bsky.authenticate():
            clients.append(("bluesky", bsky))
            logger.info("✓ Bluesky client authenticated")
        else:
            logger.warning("✗ Bluesky authentication failed")

    # Twitter
    if os.getenv("TWITTER_API_KEY") and os.getenv("TWITTER_ACCESS_TOKEN"):
        logger.info("Initializing Twitter client...")
        twitter = TwitterClient()
        if await twitter.authenticate():
            clients.append(("twitter", twitter))
            logger.info("✓ Twitter client authenticated")
        else:
            logger.warning("✗ Twitter authentication failed")

    if not clients:
        raise SystemExit(
            "No social media clients configured. Set BLUESKY_USERNAME/PASSWORD or TWITTER_API_KEY/ACCESS_TOKEN."
        )

    poll_interval = int(os.getenv("SOCIALBOT_POLL_INTERVAL", "30"))

    logger.info(
        f"SocialBot started. Polling {len(clients)} platform(s): {', '.join(p for p, _ in clients)}"
    )
    while True:
        for platform, client in clients:
            await poll_and_process_once(client, platform, provider="claude")
        await asyncio.sleep(poll_interval)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopping SocialBot…")
