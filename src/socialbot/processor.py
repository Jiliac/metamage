import os
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple, List

from .agent_runner import run_agent_with_logging
from .summarizer import summarize
from ..ops_model.models import SocialNotification

logger = logging.getLogger("socialbot.processor")


def _anonymize_user_content(content: str) -> str:
    """
    Anonymize user handles in content for database storage to respect GDPR.
    Removes @handle.domain patterns entirely to avoid storing PII.
    """
    import re

    # Remove @handle.domain.ext patterns and clean up any leading ": " that might remain
    anonymized = re.sub(r"@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}:\s*", "", content)
    return anonymized


def _iso_now() -> datetime:
    return datetime.now(timezone.utc)


def _extract_parent_root_from_thread(
    thread_json: dict, target_uri: str
) -> Tuple[Optional[Tuple[str, Optional[str]]], Optional[Tuple[str, Optional[str]]]]:
    """
    From app.bsky.feed.getPostThread result, find parent and root (uri, cid)
    for the node matching target_uri.
    """

    def find_node(node: dict) -> Optional[dict]:
        if not node:
            return None
        post = node.get("post") or {}
        if post.get("uri") == target_uri:
            return node
        # Search parent chain
        parent = node.get("parent")
        if parent and isinstance(parent, dict):
            res = find_node(parent)
            if res:
                return res
        # Search replies
        for child in node.get("replies") or []:
            res = find_node(child)
            if res:
                return res
        return None

    root_obj = thread_json.get("thread")
    node = find_node(root_obj)
    if not node:
        return None, None

    # Get the post record to check its reply references
    post = node.get("post") or {}
    record = post.get("record") or {}
    reply_ref = record.get("reply") or {}

    # Extract parent from the node structure (immediate parent)
    parent_node = node.get("parent")
    parent_uri = None
    parent_cid = None
    if isinstance(parent_node, dict):
        ppost = parent_node.get("post") or {}
        parent_uri = ppost.get("uri")
        parent_cid = ppost.get("cid")

    # Extract root from the post's reply reference (the actual thread root)
    # If the post has a reply.root, use that; otherwise it IS the root
    root_uri = None
    root_cid = None
    if reply_ref:
        root_ref = reply_ref.get("root") or {}
        root_uri = root_ref.get("uri")
        root_cid = root_ref.get("cid")

    # If no reply reference exists, this post IS the root
    if not root_uri:
        root_uri = post.get("uri")
        root_cid = post.get("cid")

    parent_tuple = (parent_uri, parent_cid) if parent_uri else None
    root_tuple = (root_uri, root_cid) if root_uri else None
    return parent_tuple, root_tuple


def _find_target_node(thread_json: dict, target_uri: str) -> Optional[dict]:
    node = thread_json.get("thread") or {}
    stack = [node]
    while stack:
        cur = stack.pop()
        post = cur.get("post") or {}
        if post.get("uri") == target_uri:
            return cur
        parent = cur.get("parent")
        if isinstance(parent, dict):
            stack.append(parent)
        for child in cur.get("replies") or []:
            if isinstance(child, dict):
                stack.append(child)
    return None


def _ancestor_path(node: dict) -> List[dict]:
    """Return list of nodes from root to given node (inclusive)."""
    path: List[dict] = []
    cur = node
    while isinstance(cur, dict) and cur:
        path.append(cur)
        parent = cur.get("parent")
        cur = parent if isinstance(parent, dict) else None
    return list(reversed(path))


def build_conversation_messages(
    thread_json: dict,
    target_uri: str,
    our_did: Optional[str],
    max_turns: Optional[int] = None,
    max_chars: Optional[int] = None,
) -> List[tuple]:
    """
    Build alternating ('user'|'assistant', text) messages from the root to target.
    - our_did messages are treated as 'assistant'; others as 'user'.
    - Limits by last max_turns and overall character budget max_chars.
    """
    logger.info(
        f"Building conversation messages for target_uri: {target_uri}, our_did: {our_did}"
    )

    if max_turns is None:
        try:
            max_turns = int(os.getenv("SOCIALBOT_MAX_TURNS", "8"))
        except Exception:
            max_turns = 8
    if max_chars is None:
        try:
            max_chars = int(os.getenv("SOCIALBOT_CONTEXT_MAX_CHARS", "5000"))
        except Exception:
            max_chars = 5000

    target = _find_target_node(thread_json, target_uri)
    if not target:
        logger.info(f"Could not find target node for URI: {target_uri}")
        return []

    path = _ancestor_path(target)
    logger.info(f"Ancestor path has {len(path)} nodes")

    msgs: List[tuple] = []
    for i, n in enumerate(path):
        post = n.get("post") or {}
        rec = post.get("record") or {}
        text = (rec.get("text") or "").strip()
        if not text:
            logger.info(f"Skipping node {i} due to empty text")
            continue
        author = post.get("author") or {}
        handle = author.get("handle") or "unknown"
        did = author.get("did")
        role = "assistant" if (our_did and did == our_did) else "user"
        msg = (role, f"@{handle}: {text}")
        msgs.append(msg)
        logger.info(
            f"Added message {i}: role={role}, handle={handle}, text_len={len(text)}"
        )

    # Trim by turns (keep tail)
    if len(msgs) > max_turns:
        original_len = len(msgs)
        msgs = msgs[-max_turns:]
        logger.info(f"Trimmed by turns: {original_len} -> {len(msgs)} messages")

    # Trim by chars (keep tail)
    total = 0
    trimmed_reversed: List[tuple] = []
    for m in reversed(msgs):
        s = f"{m[0]}:{m[1]}"
        add = len(s)
        if total + add > max_chars and trimmed_reversed:
            logger.info(
                f"Stopping char trimming: total={total}, add={add}, max_chars={max_chars}"
            )
            break
        total += add
        trimmed_reversed.append(m)
    msgs = list(reversed(trimmed_reversed)) if trimmed_reversed else msgs
    return msgs


async def fetch_thread_and_update(session, client, notif) -> dict:
    """Fetch thread for notif.post_uri, update notif with thread_json, parent/root, and text."""
    logger.info(f"Fetching thread for {notif.post_uri}")
    thread = await client.get_post_thread(notif.post_uri, depth=10)
    notif.thread_json = thread

    parent_tuple, root_tuple = _extract_parent_root_from_thread(thread, notif.post_uri)
    if parent_tuple:
        notif.parent_uri, notif.parent_cid = parent_tuple
        logger.info(f"Found parent: {notif.parent_uri}")
    if root_tuple:
        notif.root_uri, notif.root_cid = root_tuple
        logger.info(f"Found root: {notif.root_uri}")

    # Extract post text for target node if missing
    def _get_post_text_from_thread(thread_json: dict, target_uri: str) -> str:
        node = thread_json.get("thread") or {}
        stack = [node]
        while stack:
            cur = stack.pop()
            post = cur.get("post") or {}
            if post.get("uri") == target_uri:
                rec = post.get("record") or {}
                return rec.get("text") or ""
            parent = cur.get("parent")
            if isinstance(parent, dict):
                stack.append(parent)
            for child in cur.get("replies") or []:
                if isinstance(child, dict):
                    stack.append(child)
        return ""

    notif.text = notif.text or _get_post_text_from_thread(thread, notif.post_uri)
    logger.info(
        f"Extracted text: {notif.text[:100]}..." if notif.text else "No text found"
    )
    session.commit()
    return thread


async def summarize_with_link(
    answer: str, provider: str, session_id: str
) -> tuple[str, str]:
    """Summarize answer and append session link within 300-char Bluesky limit."""
    site_url = os.getenv("NEXT_PUBLIC_SITE_URL", "https://www.metamages.com").rstrip(
        "/"
    )
    session_link = f"{site_url}/sessions/{session_id}"
    suffix = f"\n\nFull analysis: {session_link}"
    allowed_len = 300 - len(suffix)
    if allowed_len < 50:
        allowed_len = 50
    short = await summarize(answer, provider=provider, limit=allowed_len, max_retries=2)
    post_text = short.rstrip() + suffix
    if len(post_text) > 300:
        max_summary_len = 300 - len(suffix) - 3
        post_text = short[:max_summary_len].rstrip() + "..." + suffix
    return post_text, session_link


async def process_one_notification(session, client, notif, provider: str) -> None:
    """
    Process a single claimed notification with full conversation context:
    - fetch thread, compute parent/root, extract text
    - build conversation messages (multi-turn)
    - run agent, summarize, append session link
    - post reply and persist results
    """
    try:
        # Skip non-post notifications (follow, like, etc.)
        if notif.reason not in ("mention", "reply", "quote"):
            notif.status = "skipped"
            notif.error_message = f"Notification type '{notif.reason}' is not supported"
            session.commit()
            return

        # Fetch and annotate thread
        thread = await fetch_thread_and_update(session, client, notif)

        # Build conversation messages from root -> target
        messages = build_conversation_messages(
            thread, notif.post_uri, getattr(client, "did", None)
        )
        if not messages:
            # Fallback to simple prompt if we couldn't parse conversation
            logger.info(
                f"No conversation messages found for {notif.post_uri}, using fallback prompt"
            )
            user_text = f"Bluesky mention by @{notif.actor_handle or 'unknown'}:\n{notif.text or ''}\n\nPlease answer the question based on MTG tournament data. The full thread JSON is available but omitted here."
            messages = [("user", user_text)]

        # Reuse prior session for this thread if available
        reuse_session_id = None
        if notif.root_uri:
            reuse_session_id = (
                session.query(SocialNotification.session_id)
                .filter(
                    SocialNotification.platform == "bluesky",
                    SocialNotification.root_uri == notif.root_uri,
                    SocialNotification.session_id.isnot(None),
                )
                .order_by(SocialNotification.created_at.asc())
                .limit(1)
                .scalar()
            )

        # Run agent
        logger.info(
            f"Running MTG agent with conversation context (reuse_session_id={reuse_session_id})..."
        )
        answer, session_id = await run_agent_with_logging(
            messages,
            provider=provider,
            session_id=reuse_session_id,
            anonymize_fn=_anonymize_user_content,
        )
        logger.info(
            f"Agent completed with session {session_id}, answer length: {len(answer)}"
        )

        # Summarize and append link
        logger.info("Summarizing answer...")
        post_text, session_link = await summarize_with_link(
            answer, provider, session_id
        )
        logger.info(f"Summarized (+ link) to {len(post_text)} chars")

        # Determine reply StrongRefs; ensure CIDs
        # We reply to the user's post (notif.post_uri), not to what the user replied to
        parent_uri = notif.post_uri
        parent_cid = notif.post_cid
        root_uri = notif.root_uri or notif.post_uri
        root_cid = notif.root_cid or notif.post_cid

        if not parent_cid or not root_cid:
            logger.error("Missing StrongRef CIDs for reply; aborting")
            notif.status = "error"
            notif.error_message = "Missing parent/root CID for reply"
            session.commit()
            return

        # Post reply
        logger.info(f"Posting reply to parent {parent_uri}")
        created_uri = await client.reply(
            post_text,
            parent_uri=parent_uri,
            parent_cid=parent_cid,
            root_uri=root_uri,
            root_cid=root_cid,
            link_url=session_link,
        )

        # Persist success
        notif.status = "answered"
        notif.response_text = post_text
        notif.response_uri = created_uri
        notif.answered_at = _iso_now()
        notif.session_id = session_id
        session.commit()

        logger.info(
            f"Successfully answered notification {notif.id} with post: {created_uri}"
        )
    except Exception as e:
        logger.exception(f"Error processing notification {notif.id}")
        try:
            notif.status = "error"
            notif.error_message = str(e)
            session.commit()
            logger.info(f"Marked notification {notif.id} as error")
        except Exception as commit_error:
            logger.exception(
                f"Failed to mark notification {notif.id} as error: {commit_error}"
            )
            session.rollback()
