# Social Clients Unified Architecture

## Overview

This document describes the design and implementation plan for unifying social media client implementations across MetaMage's magebridge (Discord→Social) and socialbot (Social→Agent→Social) components.

## Current State

### Existing Implementations

1. **src/socialbot/bsky_client.py** - Bluesky client implementing `SocialClient` protocol for notifications/replies
2. **src/socialbot/client_base.py** - Protocol defining the interface for socialbot
3. **src/magebridge/bluesky.py** - Separate Bluesky client for Discord bridge (posting only)
4. **scripts/hello_twitter.py** - Twitter client proof-of-concept

### Use Cases

**Magebridge (Discord→Social Bridge)**

- Monitors Discord channels for messages
- Posts content to social media platforms
- Needs: `post_text()`, `post_with_images()`
- Tracks posts in `SocialMessage` table (linked to `DiscordPost`)

**Socialbot (Social→Agent→Social Responder)**

- Polls social media for notifications (mentions/replies)
- Runs MCP-backed agent to generate responses
- Posts replies back to social media
- Needs: `list_notifications()`, `get_post_thread()`, `reply()`
- Tracks in `SocialNotification` table (self-contained)

## Architecture Goal

Create unified client implementations that support **both** posting (magebridge) and notification/reply (socialbot) capabilities, while maintaining separate instances per platform.

## Design Decisions

### 1. Single Protocol, Multiple Instances

- One `SocialClient` protocol covering both use cases
- Separate client instances per platform: `BlueskyClient()`, `TwitterClient()`
- Each instance maintains its own authentication state
- Consumers instantiate the clients they need

### 2. File Structure

```
src/social_clients/
├── __init__.py          # Exports BlueskyClient, TwitterClient
├── base.py              # SocialClient protocol definition
├── bluesky.py           # Unified Bluesky implementation
├── twitter.py           # Unified Twitter/X implementation
└── factory.py           # (Optional) Client factory for convenience
```

### 3. Protocol Interface

```python
class SocialClient(Protocol):
    # Properties
    platform_name: str  # "bluesky" or "twitter"

    # Authentication
    async def authenticate() -> bool

    # Posting (Magebridge)
    async def post_text(text: str) -> bool
    async def post_with_images(text: str, image_urls: List[str]) -> bool

    # Notifications (Socialbot)
    async def list_notifications(cursor: Optional[str] = None) -> Tuple[List[Dict], Optional[str]]
    async def get_post_thread(uri: str, depth: int = 10) -> Dict[str, Any]
    async def reply(text: str, parent_uri: str, parent_cid: Optional[str],
                   root_uri: str, root_cid: Optional[str],
                   link_url: Optional[str] = None) -> str
```

### 4. Database Schema (No Changes Required)

**Magebridge Flow:**

```
DiscordPost (1) ──→ (N) SocialMessage
  discord_id           platform="bluesky"|"twitter"
  content              discord_post_id (FK)
                       success
```

**Socialbot Flow:**

```
SocialNotification (self-contained)
  platform="bluesky"|"twitter"
  post_uri (incoming)
  response_uri (outgoing)
  session_id (FK to ChatSession)
```

The existing schema already supports multi-platform:

- `SocialMessage.platform` tracks which platform for magebridge
- `SocialNotification.platform` tracks which platform for socialbot
- No schema changes needed

### 5. Multi-Platform Support

**Magebridge:**

```python
enabled_clients = []
if os.getenv("BLUESKY_USERNAME"):
    enabled_clients.append(BlueskyClient())
if os.getenv("TWITTER_API_KEY"):
    enabled_clients.append(TwitterClient())

# Post to all enabled platforms
for client in enabled_clients:
    success = await client.post_with_images(text, image_urls)
    # Create one SocialMessage per platform
    social_message = SocialMessage(
        platform=client.platform_name,
        discord_post_id=discord_post.id,
        success=success,
        ...
    )
```

**Socialbot:**

```python
# Separate polling per platform
bluesky = BlueskyClient()
twitter = TwitterClient()

# Each has its own Pass record
pass_bsky = Pass(pass_type="bsky_notifications", ...)
pass_twitter = Pass(pass_type="twitter_notifications", ...)

# Process notifications from both
for client in [bluesky, twitter]:
    notifs, cursor = await client.list_notifications()
    # Create SocialNotification records with platform field
```

## Implementation Plan

### Phase 1: Magebridge (Posting)

#### 1a. Create File Structure + Base Protocol

**Files to create:**

- `src/social_clients/__init__.py`
- `src/social_clients/base.py`

**Protocol definition:**

- `platform_name` property
- `authenticate()` method
- `post_text()` method
- `post_with_images()` method
- Notification methods as stubs (raise `NotImplementedError`)

#### 1b. Bluesky Migration

**Tasks:**

- Create `src/social_clients/bluesky.py`
- Move code from `src/magebridge/bluesky.py`
- Implement the posting protocol
- Update `src/magebridge/discord.py` to import from new location
- Keep existing functionality intact

**Test script:**

- `scripts/test_social_post.py` - Post "Hello from unified client" to Bluesky (text only)

#### 1c. Twitter Implementation

**Tasks:**

- Create `src/social_clients/twitter.py`
- Base on `scripts/hello_twitter.py`
- Implement posting protocol
- Add image upload support (Twitter API v1.1 media upload endpoint)
- Add `await asyncio.sleep(1)` for rate limiting

**Image upload differences:**

- **Bluesky**: `uploadBlob` → blob reference → embed in post
- **Twitter**: `POST /1.1/media/upload.json` → media_id → include in v2 tweet

**Test scripts:**

- `scripts/test_social_post.py --platform twitter` - Text only
- `scripts/test_social_post_images.py --platform twitter` - With images

#### 1d. Magebridge Integration

**Tasks:**

- Update `src/magebridge/discord.py`:
  - Support multiple clients via `enabled_clients` list
  - Loop over clients in `process_message_for_social()`
  - Create one `SocialMessage` per platform
  - Check per-platform success in historical processing

**Test:**

- Post a Discord message
- Verify it appears on both Bluesky and Twitter
- Verify separate `SocialMessage` records created

### Phase 2: Socialbot (Notifications + Replies)

#### 2a. Extend Protocol for Notifications

**Tasks:**

- Add to `src/social_clients/base.py`:
  - `list_notifications()` method
  - `get_post_thread()` method
  - `reply()` method
- Make them optional (default raises `NotImplementedError`)

#### 2b. Bluesky Socialbot Migration

**Tasks:**

- Merge `src/socialbot/bsky_client.py` into `src/social_clients/bluesky.py`
- Now one unified client with both posting AND notification methods
- Update `src/socialbot/server.py` to import from new location
- Preserve all existing notification/reply functionality

**Test:**

- Run socialbot
- Mention the bot on Bluesky
- Verify it responds correctly

#### 2c. Twitter Socialbot (Limited)

**Tasks:**

- Implement `list_notifications()` - Use Twitter mentions timeline API
- Implement `reply()` - Use Twitter v2 reply endpoint
- Implement `get_post_thread()` - Return minimal structure (just the notification itself)
  - No full thread context initially
  - Return empty/minimal thread data
  - Socialbot's `build_conversation_messages()` already handles this gracefully

**Rationale for limited thread support:**

- Twitter's conversation threading API is complex
- Initial implementation focuses on direct mentions
- Can be enhanced later if needed

**Test script:**

- `scripts/test_social_reply.py --platform twitter`
- Mention the bot on Twitter
- Verify it responds (without full thread context)

#### 2d. Socialbot Multi-Platform

**Tasks:**

- Update `src/socialbot/server.py`:
  - Poll both platforms
  - Separate `Pass` records: `"bsky_notifications"`, `"twitter_notifications"`
  - Create `SocialNotification` records with correct `platform` field
  - Process notifications from both platforms

**Test:**

- Mention bot on Bluesky
- Mention bot on Twitter
- Verify both get responses
- Verify separate database records

## Rate Limiting Strategy

### Twitter

- Add `await asyncio.sleep(1)` between API calls in implementation
- No protocol-level retry/backoff
- Implementation-specific rate limit handling

### Bluesky

- Current implementation already has retry logic in `_request()` method
- Keep existing backoff strategy

## Image Handling

### Bluesky Process

1. Download image from URL
2. Compress if >950KB (JPEG quality reduction + resize)
3. Upload via `POST /xrpc/com.atproto.repo.uploadBlob`
4. Get blob reference
5. Create post with `embed.images` array

### Twitter Process

1. Download image from URL
2. Upload via `POST /1.1/media/upload.json` (v1.1 endpoint)
3. Get `media_id`
4. Create tweet via v2 API with `media.media_ids` array

### Protocol Abstraction

```python
async def post_with_images(self, text: str, image_urls: List[str]) -> bool:
    # Each implementation handles its own:
    # - Image download
    # - Compression/resizing
    # - Platform-specific upload
    # - Post creation with media
```

## Thread Context Handling

### Bluesky

- Full thread support via `app.bsky.feed.getPostThread`
- Returns complete conversation tree
- Socialbot builds multi-turn context from thread

### Twitter

- Limited initial implementation
- `get_post_thread()` returns minimal structure:
  ```python
  {
      "thread": {
          "post": {
              "uri": notification.post_uri,
              "record": {"text": notification.text},
              "author": {"handle": notification.actor_handle}
          }
      }
  }
  ```
- No parent/root traversal initially
- Socialbot falls back to single-turn context

## Environment Variables

### Bluesky

- `BLUESKY_USERNAME` - Account username/email
- `BLUESKY_PASSWORD` - Account password

### Twitter

- `TWITTER_API_KEY` - API key (consumer key)
- `TWITTER_API_SECRET` - API secret (consumer secret)
- `TWITTER_ACCESS_TOKEN` - Access token
- `TWITTER_ACCESS_TOKEN_SECRET` - Access token secret

## Testing Strategy

### Test Scripts

1. `scripts/test_social_post.py` - Text posting (phase 1b/1c)
2. `scripts/test_social_post_images.py` - Image posting (phase 1b/1c)
3. `scripts/test_social_reply.py` - Notification + reply (phase 2b/2c)

### Integration Tests

- Magebridge: Post Discord message → verify on both platforms
- Socialbot: Mention bot on both platforms → verify responses
- Database: Verify correct `SocialMessage` and `SocialNotification` records

## Migration Path

### Backward Compatibility

- Existing code continues to work during migration
- Gradual migration per component:
  1. Magebridge Bluesky → new client
  2. Magebridge Twitter → new client
  3. Socialbot Bluesky → new client
  4. Socialbot Twitter → new client

### Deprecation

- `src/magebridge/bluesky.py` → deprecated after 1b
- `src/socialbot/bsky_client.py` → deprecated after 2b
- `src/socialbot/client_base.py` → deprecated after 2a
- `scripts/hello_twitter.py` → reference implementation, keep for documentation

## Future Enhancements

### Potential Additions

- Factory pattern in `factory.py` for convenience
- Enhanced Twitter thread support
- Additional platforms (Mastodon, Threads, etc.)
- Unified retry/backoff at protocol level
- Media type detection and conversion
- Video support

### Not Planned

- Protocol-level rate limiting (implementation-specific)
- Cross-platform thread linking
- Automated platform detection from URLs

## Success Criteria

### Phase 1 Complete When:

- ✅ Magebridge posts to both Bluesky and Twitter
- ✅ Separate `SocialMessage` records per platform
- ✅ Image posting works on both platforms
- ✅ Historical Discord messages processed for both platforms

### Phase 2 Complete When:

- ✅ Socialbot responds to Bluesky mentions (existing functionality preserved)
- ✅ Socialbot responds to Twitter mentions (new functionality)
- ✅ Separate `SocialNotification` records per platform
- ✅ Both platforms polled and processed independently

## Open Questions

None at this time. All design decisions have been made.

## Document History

- 2025-01-XX: Initial design document created
- Decisions made through collaborative discussion
- Ready for implementation
