# SocialBot Service (Bluesky-first, platform-agnostic)

This document specifies a minimal, platform-agnostic service for responding to social mentions, starting with Bluesky and keeping the door open for Twitter later.

## Goals

- Poll social notifications (no webhooks).
- Detect mentions/replies/quotes directed at our account.
- Run the existing MTG ReAct agent with the mention and thread as context.
- Summarize the agent’s answer to a short post (≤250 chars by default).
- Reply in-thread.
- Persist notifications and statuses in the Ops DB.

## Data Model

Add a new table in the Ops DB:

- Table: social_notifications
  - id (uuid pk)
  - platform (str) — e.g. "bluesky", "twitter"
  - post_uri (str) — Bluesky post URI, Tweet ID/URL, etc.
  - post_cid (str|null) — Bluesky CID (null for other platforms)
  - actor_id (str|null) — DID/user ID of the actor that mentioned us
  - actor_handle (str|null)
  - reason (str) — mention|reply|quote|like|...
  - text (text|null) — the actor’s message body (may be backfilled after fetching thread)
  - indexed_at (datetime|null) — platform-provided indexing time if available
  - status (str) — pending|processing|answered|skipped|error
  - is_self (bool) — true if actor_id equals our own account ID (skip loops)
  - attempts (int) — number of processing attempts
  - error_message (text|null)
  - root_uri/root_cid (str|null) — thread root pointers
  - parent_uri/parent_cid (str|null) — direct parent pointers
  - thread_json (JSONB|null) — raw thread JSON (opaque, for context)
  - response_text (text|null) — our final summarized reply
  - response_uri (str|null) — URI/ID of our posted reply
  - answered_at (datetime|null)
  - session_id (uuid|null) — link to ChatSession for traceability

Uniqueness:
- UniqueConstraint(platform, post_uri, actor_id, reason)

Useful indices:
- (platform, status, indexed_at)

## Platform-agnostic Client Interface

Python Protocol to be implemented per platform:

```python
class SocialClient(Protocol):
    async def list_notifications(self, cursor: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Return (notifications, next_cursor). Normalized notification dict keys:
           platform, post_uri, post_cid, reason, actor_id, actor_handle, text, indexed_at,
           root_uri, root_cid, parent_uri, parent_cid (optional hints)."""

    async def get_post_thread(self, uri: str, depth: int = 10) -> Dict[str, Any]:
        """Return platform-native thread JSON (opaque)."""

    async def reply(self, text: str, parent_uri: str, parent_cid: Optional[str], root_uri: str, root_cid: Optional[str]) -> str:
        """Create a reply, return new post URI/ID."""
```

## Bluesky Implementation Details

Endpoints used:

- Auth: `com.atproto.server.createSession` (POST)
- List notifications: `app.bsky.notification.listNotifications` (GET, params: limit, cursor)
- Get thread: `app.bsky.feed.getPostThread` (GET, params: uri, depth)
- Reply (create post): `com.atproto.repo.createRecord` (POST)
  - Body includes:
    - repo: our DID
    - collection: `"app.bsky.feed.post"`
    - record:
      - `$type`: `"app.bsky.feed.post"`
      - `text`: reply text
      - `createdAt`: RFC3339 timestamp (e.g., `"2025-09-10T12:00:00Z"`)
      - `reply`: `{ "root": {"uri","cid"}, "parent": {"uri","cid"} }`

Authentication:
- Store `accessJwt`, `refreshJwt`, `did` from `createSession`.

Self-check:
- “Ignore if actor DID == your DID.” This means: skip notifications where `actor_id` (who mentioned you) equals your own account’s DID to avoid loops and self-replies.

## Server Loop

- Maintain a pass record in the ops `passes` table:
  - `pass_type = "bsky_notifications"`
  - Use `notes` to store the Bluesky `cursor`.
  - Optionally store `last_processed_time = latest indexedAt seen`.

- Poll every N seconds (default 30):
  1) `list_notifications(cursor)`
  2) Upsert rows into `social_notifications`
     - If `actor_id == our DID`, set `status="skipped"` and `is_self=True`.
     - Otherwise `status="pending"`.
  3) Update `cursor` in the pass record.

- Processing:
  - Select oldest `pending` notification for platform "bluesky".
  - Mark `status="processing"`, increment `attempts`.
  - Fetch thread with `get_post_thread(post_uri, depth=10)`.
  - Extract `root/parent` URIs + CIDs from the thread and store in the row.
  - Build a single user message: mention text + note that full thread exists.
    - Keep It Simple (KISS). No aggressive truncation unless needed.
  - Run the MTG ReAct agent and capture the answer (+ logging/titles).
  - Summarize with small model to ≤250 characters (retry if too long, then hard-cap).
  - Reply in-thread using `reply(...)`.
  - Update row: `status="answered"`, `response_text`, `response_uri`, `answered_at`, `session_id`.

- Error handling:
  - On failure, set `status="error"` and store `error_message`. Retry next loop.

## Extending to Twitter

- Implement `SocialClient` for Twitter:
  - `list_notifications` -> mentions timeline
  - `get_post_thread` -> conversation lookup
  - `reply` -> post tweet (in_reply_to)
- Reuse the same server loop, DB model, and summarizer.

## Environment Variables

- BLUESKY_USERNAME, BLUESKY_PASSWORD
- SOCIALBOT_POLL_INTERVAL (default: 30 seconds)
- ANTHROPIC_API_KEY (for agent and summarizer) and/or OPENAI_API_KEY (optional)

## Running

- Ensure Ops DB is configured (POSTGRES_URL or SQLite fallback).
- Start the MCP server separately.
- Run:

```
uv run -m src.socialbot.server
```
