from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Text,
    Boolean,
    Index,
    UniqueConstraint,
    BigInteger,
    Integer,
)
from sqlalchemy import JSON
from sqlalchemy.orm import relationship
from .base import Base, uuid_pk, TimestampMixin


class FocusedChannel(Base, TimestampMixin):
    """Channels that the Discord bridge monitors for messages."""

    __tablename__ = "focused_channels"

    id = uuid_pk()
    guild_id = Column(String(20), nullable=False, index=True)  # Discord guild ID
    channel_id = Column(
        String(20), nullable=False, unique=True, index=True
    )  # Discord channel ID
    channel_name = Column(String(100), nullable=False)  # Human-readable channel name
    format = Column(String(20), nullable=False)  # MTG format (modern, pioneer, etc.)
    is_active = Column(
        Boolean, nullable=False, default=True
    )  # Whether to monitor this channel

    # Relationships
    discord_posts = relationship("DiscordPost", back_populates="channel")

    # Constraints
    __table_args__ = (
        UniqueConstraint("guild_id", "channel_id", name="uq_guild_channel"),
    )

    def __repr__(self):
        return f"<FocusedChannel(guild_id={self.guild_id}, channel_name='{self.channel_name}')>"


class DiscordPost(Base, TimestampMixin):
    """Discord messages that have been processed by the bridge."""

    __tablename__ = "discord_posts"

    id = uuid_pk()
    discord_id = Column(
        String(20), nullable=False, unique=True, index=True
    )  # Discord message ID
    channel_id = Column(
        String(36),
        ForeignKey("focused_channels.id", name="fk_discord_post_channel"),
        nullable=False,
        index=True,
    )
    author_id = Column(String(20), nullable=False, index=True)  # Discord user ID
    author_name = Column(String(100), nullable=False)  # Discord username
    content = Column(Text, nullable=True)  # Message content
    message_time = Column(
        DateTime, nullable=False, index=True
    )  # When message was posted on Discord
    has_attachments = Column(Boolean, nullable=False, default=False)
    attachment_urls = Column(Text, nullable=True)  # JSON array of attachment URLs

    # Relationships
    channel = relationship("FocusedChannel", back_populates="discord_posts")
    social_messages = relationship("SocialMessage", back_populates="discord_post")

    def __repr__(self):
        return (
            f"<DiscordPost(discord_id={self.discord_id}, author='{self.author_name}')>"
        )


class SocialMessage(Base, TimestampMixin):
    """Social media posts that were bridged from Discord messages."""

    __tablename__ = "social_messages"

    id = uuid_pk()
    platform = Column(
        String(20), nullable=False, default="bluesky"
    )  # Social media platform
    discord_post_id = Column(
        String(36),
        ForeignKey("discord_posts.id", name="fk_social_message_discord_post"),
        nullable=False,
        index=True,
    )
    external_id = Column(String(100), nullable=True)  # Platform-specific message ID
    content = Column(Text, nullable=False)  # Formatted content for the platform
    post_time = Column(
        DateTime, nullable=False, index=True
    )  # When posted to social media
    success = Column(
        Boolean, nullable=False, default=False
    )  # Whether the post was successful
    error_message = Column(Text, nullable=True)  # Error details if post failed

    # Relationships
    discord_post = relationship("DiscordPost", back_populates="social_messages")

    def __repr__(self):
        return f"<SocialMessage(platform='{self.platform}', success={self.success})>"


class Pass(Base, TimestampMixin):
    """Internal tracking of bridge processing passes to avoid reprocessing messages."""

    __tablename__ = "passes"

    id = uuid_pk()
    pass_type = Column(
        String(50), nullable=False, default="discord_history"
    )  # Type of processing pass
    start_time = Column(DateTime, nullable=False)  # When this pass started
    end_time = Column(DateTime, nullable=True)  # When this pass completed
    last_processed_time = Column(
        DateTime, nullable=True
    )  # Latest message timestamp processed
    messages_processed = Column(
        BigInteger, nullable=False, default=0
    )  # Count of messages processed
    success = Column(
        Boolean, nullable=False, default=False
    )  # Whether pass completed successfully
    notes = Column(Text, nullable=True)  # Additional details about the pass

    def __repr__(self):
        return f"<Pass(pass_type='{self.pass_type}', start_time='{self.start_time}')>"


# Performance indexes
Index("idx_discord_post_message_time", DiscordPost.message_time)
Index("idx_social_message_post_time", SocialMessage.post_time)
Index("idx_pass_type_start", Pass.pass_type, Pass.start_time)


class SocialNotification(Base, TimestampMixin):
    """Normalized social notification across platforms (Bluesky, Twitter, etc.)."""

    __tablename__ = "social_notifications"

    id = uuid_pk()
    platform = Column(
        String(20), nullable=False, index=True
    )  # e.g. 'bluesky', 'twitter'
    post_uri = Column(
        String(255), nullable=False, index=True
    )  # Bluesky post URI or tweet URL/ID
    post_cid = Column(String(100), nullable=True)  # Bluesky CID; null for others
    actor_id = Column(String(200), nullable=True, index=True)  # DID/user id
    actor_handle = Column(String(200), nullable=True)
    reason = Column(
        String(30), nullable=False, index=True
    )  # mention|reply|quote|like|...
    text = Column(Text, nullable=True)
    indexed_at = Column(DateTime, nullable=True, index=True)

    status = Column(
        String(20), nullable=False, default="pending", index=True
    )  # pending|processing|answered|skipped|error
    is_self = Column(Boolean, nullable=False, default=False)
    attempts = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)

    # Thread + response metadata
    root_uri = Column(String(255), nullable=True)
    root_cid = Column(String(100), nullable=True)
    parent_uri = Column(String(255), nullable=True)
    parent_cid = Column(String(100), nullable=True)
    thread_json = Column(JSON, nullable=True)

    # Response linkage
    response_text = Column(Text, nullable=True)
    response_uri = Column(String(255), nullable=True)
    answered_at = Column(DateTime, nullable=True)

    # Link to analysis session for traceability
    session_id = Column(
        String(36), ForeignKey("chat_sessions.id"), nullable=True, index=True
    )

    # Relationships
    session = relationship("ChatSession", back_populates="social_notifications")

    __table_args__ = (
        UniqueConstraint(
            "platform",
            "post_uri",
            "actor_id",
            "reason",
            name="uq_social_notification_unique",
        ),
    )

    def __repr__(self):
        return f"<SocialNotification(platform='{self.platform}', reason='{self.reason}', status='{self.status}')>"


# Performance indexes for SocialNotification
Index(
    "idx_social_notification_platform_status_time",
    SocialNotification.platform,
    SocialNotification.status,
    SocialNotification.indexed_at,
)
