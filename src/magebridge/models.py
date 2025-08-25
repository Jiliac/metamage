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
)
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import uuid

Base = declarative_base()


def generate_uuid():
    """Generate a UUID string for primary keys."""
    return str(uuid.uuid4())


def uuid_pk():
    """Create a UUID primary key column."""
    return Column(String(36), primary_key=True, default=generate_uuid)


class TimestampMixin:
    """Mixin to add created_at and updated_at timestamps to models."""

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class FocusedChannel(Base, TimestampMixin):
    """Channels that the Discord bridge monitors for messages."""

    __tablename__ = "focused_channels"

    id = uuid_pk()
    guild_id = Column(String(20), nullable=False, index=True)  # Discord guild ID
    channel_id = Column(
        String(20), nullable=False, unique=True, index=True
    )  # Discord channel ID
    channel_name = Column(String(100), nullable=False)  # Human-readable channel name
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
