#!/usr/bin/env python3
"""
SocialBot server: polls Bluesky notifications, runs the MTG agent,
summarizes to <=250 chars, and replies in-thread.
"""

import os
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple, List

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
from .bsky_client import BlueskySocialClient
from .agent_runner import run_agent_with_logging
from .summarizer import summarize

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
        p = Pass(pass_type=pass_type, start_time=datetime.now(timezone.utc), success=False)
        session.add(p)
        session.commit()
    return p


def _iso_now() -> datetime:
    return datetime.now(timezone.utc)


def _extract_parent_root_from_thread(thread_json: dict, target_uri: str) -> Tuple[Optional[Tuple[str, Optional[str]]], Optional[Tuple[str, Optional[str]]]]:
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


async def poll_and_process_once(client: BlueskySocialClient, provider: str = "claude") -> None:
    """
    Poll notifications once, upsert to DB, process one pending notification.
    """
    SessionFactory = get_ops_session_factory()
    session = SessionFactory()
    try:
        pass_rec = _get_or_create_pass(session, "bsky_notifications")
        cursor = pass_rec.notes  # store cursor in notes
        notifs, next_cursor = await client.list_notifications(cursor=cursor)

        messages_processed = 0
        latest_indexed: Optional[datetime] = None

        # Upsert notifications
        for n in notifs:
            actor_id = n.get("actor_id")
            is_self = bool(client.did and actor_id == client.did)

            # Upsert by unique key
            existing = (
                session.query(SocialNotification)
                .filter_by(
                    platform="bluesky",
                    post_uri=n.get("post_uri"),
                    actor_id=actor_id,
                    reason=n.get("reason"),
                )
                .first()
            )
            if existing:
                # Update minimal fields
                existing.indexed_at = n.get("indexed_at") or existing.indexed_at
                existing.text = existing.text or n.get("text")
                if existing.is_self != is_self:
                    existing.is_self = is_self
            else:
                sn = SocialNotification(
                    platform="bluesky",
                    post_uri=n.get("post_uri"),
                    post_cid=n.get("post_cid"),
                    actor_id=actor_id,
                    actor_handle=n.get("actor_handle"),
                    reason=n.get("reason"),
                    text=n.get("text"),
                    indexed_at=n.get("indexed_at") if isinstance(n.get("indexed_at"), datetime) else None,
                    status="skipped" if is_self else "pending",
                    is_self=is_self,
                )
                session.add(sn)
            messages_processed += 1

            idx_at = n.get("indexed_at")
            if isinstance(idx_at, datetime):
                latest_indexed = idx_at if latest_indexed is None else max(latest_indexed, idx_at)

        # Update cursor and pass record
        pass_rec.last_processed_time = latest_indexed or pass_rec.last_processed_time
        if next_cursor:
            pass_rec.notes = next_cursor
        pass_rec.messages_processed = (pass_rec.messages_processed or 0) + messages_processed
        pass_rec.end_time = _iso_now()
        pass_rec.success = True
        session.commit()

        # Process one pending notification (oldest first)
        pending = (
            session.query(SocialNotification)
            .filter(
                and_(
                    SocialNotification.platform == "bluesky",
                    SocialNotification.status == "pending",
                    SocialNotification.is_self.is_(False),
                )
            )
            .order_by(SocialNotification.indexed_at.asc().nullsfirst(), SocialNotification.created_at.asc())
            .first()
        )

        if not pending:
            return

        # Mark processing
        pending.status = "processing"
        pending.attempts = (pending.attempts or 0) + 1
        session.commit()

        # Fetch thread
        thread = await client.get_post_thread(pending.post_uri, depth=10)
        pending.thread_json = thread

        # Fill parent/root from thread
        parent_tuple, root_tuple = _extract_parent_root_from_thread(thread, pending.post_uri)
        if parent_tuple:
            pending.parent_uri, pending.parent_cid = parent_tuple
        if root_tuple:
            pending.root_uri, pending.root_cid = root_tuple

        # Try to extract post text for the target node (fallback to empty)
        def _get_post_text_from_thread(thread_json: dict, target_uri: str) -> str:
            node = thread_json.get("thread") or {}
            # simple DFS to find matching post text
            stack = [node]
            while stack:
                cur = stack.pop()
                post = cur.get("post") or {}
                if post.get("uri") == target_uri:
                    rec = post.get("record") or {}
                    return rec.get("text") or ""
                # push children
                parent = cur.get("parent")
                if isinstance(parent, dict):
                    stack.append(parent)
                for child in cur.get("replies") or []:
                    if isinstance(child, dict):
                        stack.append(child)
            return ""

        pending.text = pending.text or _get_post_text_from_thread(thread, pending.post_uri)
        session.commit()

        # Build messages for agent (KISS: include mention text + note that thread JSON is stored)
        user_text = f"Bluesky mention by @{pending.actor_handle or 'unknown'}:\n{pending.text or ''}\n\nPlease answer the question based on MTG tournament data. The full thread JSON is available but omitted here."
        messages = [("user", user_text)]

        answer, session_id = await run_agent_with_logging(messages, provider=provider)

        # Summarize to <=250 chars with retries; final hard-cap
        short = await summarize(answer, provider=provider, limit=250, max_retries=2)

        # Determine reply targets
        parent_uri = pending.parent_uri or pending.post_uri
        parent_cid = pending.parent_cid or None
        root_uri = pending.root_uri or pending.post_uri
        root_cid = pending.root_cid or None

        created_uri = await client.reply(
            short,
            parent_uri=parent_uri,
            parent_cid=parent_cid,
            root_uri=root_uri,
            root_cid=root_cid,
        )

        # Update DB
        pending.status = "answered"
        pending.response_text = short
        pending.response_uri = created_uri
        pending.answered_at = _iso_now()
        pending.session_id = session_id
        session.commit()

        logger.info(f"Answered Bluesky mention with post: {created_uri}")

    except Exception as e:
        logger.exception(f"Error in poll_and_process_once: {e}")
        session.rollback()
    finally:
        session.close()


async def main():
    ensure_tables()

    client = BlueskySocialClient()
    ok = await client.authenticate()
    if not ok:
        raise SystemExit("Failed to authenticate to Bluesky")

    poll_interval = int(os.getenv("SOCIALBOT_POLL_INTERVAL", "30"))

    logger.info("SocialBot started. Polling Bluesky notifications...")
    while True:
        await poll_and_process_once(client, provider="claude")
        await asyncio.sleep(poll_interval)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopping SocialBot…")
