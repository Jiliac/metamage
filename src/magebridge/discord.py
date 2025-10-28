from datetime import datetime, timezone
import discord
from discord.ext import commands
import json
import os
from dotenv import load_dotenv

from .logger import logger
from ..social_clients import BlueskyClient, TwitterClient, SocialMultiplexer
from ..ops_model.base import get_ops_session_factory
from ..ops_model.models import FocusedChannel, DiscordPost, SocialMessage, Pass

# Load environment variables early (before creating clients)
load_dotenv()

# Bot setup
intents = discord.Intents.default()
intents.message_content = True  # Required to read message content
intents.messages = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Database session factory will be created when needed


# Initialize social multiplexer with available clients
def create_social_multiplexer():
    """Create a social multiplexer with all configured clients."""
    clients = []

    # Add Bluesky if credentials available
    if os.getenv("BLUESKY_USERNAME") and os.getenv("BLUESKY_PASSWORD"):
        clients.append(BlueskyClient())
        logger.info("Bluesky client enabled for magebridge")

    # Add Twitter if credentials available
    if os.getenv("TWITTER_API_KEY") and os.getenv("TWITTER_ACCESS_TOKEN"):
        clients.append(TwitterClient())
        logger.info("Twitter client enabled for magebridge")

    if not clients:
        logger.warning("No social media clients configured - magebridge will not post")
        return None

    return SocialMultiplexer(clients)


social_multiplexer = create_social_multiplexer()


@bot.event
async def on_ready():
    logger.info(f"{bot.user} has connected to Discord!")
    logger.info("Monitoring configured focused channels")

    # Debug: List guild info only
    logger.info(f"Bot is in {len(bot.guilds)} guild(s)")
    for guild in bot.guilds:
        logger.info(f"Guild: {guild.name} (ID: {guild.id})")

    if len(bot.guilds) == 0:
        logger.error(
            "Bot is not in any servers! Check the invite URL and make sure the bot was added to the server."
        )

    # Initialize database with focused channels if empty
    await ensure_focused_channels()

    # Process historical messages from focused channels
    await process_historical_messages()


async def ensure_focused_channels():
    """Ensure we have focused channels set up in the database."""
    SessionFactory = get_ops_session_factory()
    session = SessionFactory()
    try:
        # Check if we have any focused channels
        existing_channels = (
            session.query(FocusedChannel).filter_by(is_active=True).all()
        )

        if not existing_channels:
            # Add default channel if none exist
            for guild in bot.guilds:
                for channel in guild.channels:
                    if channel.name.endswith("-data-analysis") and hasattr(
                        channel, "history"
                    ):
                        # Extract format from channel name (e.g., "modern-data-analysis" -> "modern")
                        format_name = channel.name.replace("-data-analysis", "")

                        focused_channel = FocusedChannel(
                            guild_id=str(guild.id),
                            channel_id=str(channel.id),
                            channel_name=channel.name,
                            format=format_name,
                            is_active=True,
                        )
                        session.add(focused_channel)
                        logger.info(
                            f"Added focused channel: {channel.name} in {guild.name}"
                        )

        session.commit()
    except Exception as e:
        logger.error(f"Error ensuring focused channels: {e}")
        session.rollback()
    finally:
        session.close()


async def process_historical_messages():
    """Process historical messages from all focused channels."""
    SessionFactory = get_ops_session_factory()
    session = SessionFactory()
    try:
        # Get all active focused channels
        focused_channels = session.query(FocusedChannel).filter_by(is_active=True).all()

        for focused_channel in focused_channels:
            channel = bot.get_channel(int(focused_channel.channel_id))
            if not channel:
                logger.warning(f"Channel {focused_channel.channel_name} not found")
                continue

            start_date = datetime(2025, 8, 20, tzinfo=timezone.utc)

            # Get the last processed message time for this channel
            last_pass = (
                session.query(Pass)
                .filter_by(pass_type=f"history_{focused_channel.channel_id}")
                .order_by(Pass.start_time.desc())
                .first()
            )
            if last_pass and last_pass.last_processed_time:
                start_date = last_pass.last_processed_time
                # Ensure start_date is timezone-aware for Discord API
                if start_date.tzinfo is None:
                    start_date = start_date.replace(tzinfo=timezone.utc)

            # Create a new pass record
            current_pass = Pass(
                pass_type=f"history_{focused_channel.channel_id}",
                start_time=datetime.now(timezone.utc),
            )
            session.add(current_pass)
            session.commit()

            logger.info(
                f"Processing history for {focused_channel.channel_name} since {start_date.date()}"
            )

            messages_processed = 0
            latest_time = start_date

            try:
                async for message in channel.history(
                    after=start_date, oldest_first=True
                ):
                    # Check if message already exists
                    existing = (
                        session.query(DiscordPost)
                        .filter_by(discord_id=str(message.id))
                        .first()
                    )

                    if not existing:
                        # Create new Discord post record
                        discord_post = DiscordPost(
                            discord_id=str(message.id),
                            channel_id=focused_channel.id,
                            author_id=str(message.author.id),
                            author_name=message.author.display_name,
                            content=message.content,
                            message_time=message.created_at,
                            has_attachments=len(message.attachments) > 0,
                            attachment_urls=json.dumps(
                                [att.url for att in message.attachments]
                            )
                            if message.attachments
                            else None,
                        )
                        session.add(discord_post)
                        session.commit()

                        messages_processed += 1
                        # Ensure both datetimes are timezone-aware for comparison
                        message_time = message.created_at
                        if message_time.tzinfo is None:
                            message_time = message_time.replace(tzinfo=timezone.utc)
                        latest_time = max(latest_time, message_time)

                        logger.info(
                            f"[HISTORY] Created post: {message.created_at}: {message.author.display_name}: {message.id}"
                        )
                    else:
                        discord_post = existing
                        # Update latest_time even for existing messages
                        message_time = message.created_at
                        if message_time.tzinfo is None:
                            message_time = message_time.replace(tzinfo=timezone.utc)
                        latest_time = max(latest_time, message_time)

                    # Check if successful social media posts exist for all enabled platforms
                    if social_multiplexer:
                        needs_posting = False
                        for client in social_multiplexer.clients:
                            platform_post_exists = (
                                session.query(SocialMessage)
                                .filter_by(
                                    discord_post_id=discord_post.id,
                                    platform=client.platform_name,
                                    success=True,
                                )
                                .first()
                            )
                            if not platform_post_exists:
                                needs_posting = True
                                break

                        if needs_posting:
                            await process_message_for_social(
                                message, discord_post, focused_channel, session
                            )
                            logger.info(
                                f"[HISTORY] Posted to social: {message.created_at}: {message.author.display_name}: {message.id}"
                            )

                # Update pass record
                current_pass.end_time = datetime.now(timezone.utc)
                current_pass.last_processed_time = latest_time
                current_pass.messages_processed = messages_processed
                current_pass.success = True
                session.commit()

                logger.info(
                    f"Processed {messages_processed} messages from {focused_channel.channel_name}"
                )

            except Exception as e:
                logger.error(
                    f"Error processing history for {focused_channel.channel_name}: {e}"
                )
                current_pass.success = False
                current_pass.notes = str(e)
                session.commit()

    except Exception as e:
        logger.error(f"Error in process_historical_messages: {e}")
        session.rollback()
    finally:
        session.close()


async def process_message(message):
    """Process a Discord message and post it to Bluesky"""
    SessionFactory = get_ops_session_factory()
    session = SessionFactory()
    try:
        # First, save the Discord message to database
        focused_channel = (
            session.query(FocusedChannel)
            .filter_by(channel_id=str(message.channel.id), is_active=True)
            .first()
        )

        if not focused_channel:
            logger.warning(f"Message from non-focused channel: {message.channel.name}")
            return

        # Check if message already processed
        existing = (
            session.query(DiscordPost).filter_by(discord_id=str(message.id)).first()
        )

        if existing:
            logger.info(f"Message {message.id} already processed")
            return

        # Create Discord post record
        discord_post = DiscordPost(
            discord_id=str(message.id),
            channel_id=focused_channel.id,
            author_id=str(message.author.id),
            author_name=message.author.display_name,
            content=message.content,
            message_time=message.created_at,
            has_attachments=len(message.attachments) > 0,
            attachment_urls=json.dumps([att.url for att in message.attachments])
            if message.attachments
            else None,
        )
        session.add(discord_post)
        session.commit()

        logger.info(f"Saved Discord message {message.id} to database")

        # Now process for social media
        await process_message_for_social(
            message, discord_post, focused_channel, session
        )

    except Exception as e:
        logger.error(f"Error processing message {message.id}: {e}")
        session.rollback()
    finally:
        session.close()


async def process_message_for_social(message, discord_post, focused_channel, session):
    """Process a Discord message for social media posting via multiplexer"""
    if not social_multiplexer:
        logger.warning("No social multiplexer configured - skipping social posting")
        return

    logger.info(f"Processing message from {message.author}: {message.content}")

    # Generate custom text based on format
    format_name = focused_channel.format.capitalize()
    post_text = f"{format_name} meta update #mtg #{focused_channel.format}"

    # Handle images
    image_urls = []
    if message.attachments:
        for attachment in message.attachments:
            if attachment.content_type and attachment.content_type.startswith("image/"):
                image_urls.append(attachment.url)

    # Post to all platforms via multiplexer
    try:
        if image_urls:
            results = await social_multiplexer.post_with_images(post_text, image_urls)
        else:
            results = await social_multiplexer.post_text(post_text)

        # Create SocialMessage record for each platform
        for platform, success in results.items():
            social_message = SocialMessage(
                platform=platform,
                discord_post_id=discord_post.id,
                content=post_text,
                post_time=datetime.now(timezone.utc),
                success=success,
                error_message=None if success else "Post failed",
            )
            session.add(social_message)

        session.commit()

        # Log results
        success_count = sum(1 for s in results.values() if s)
        total_count = len(results)
        logger.info(
            f"✅ Bridged message to {success_count}/{total_count} platforms: {results}"
        )

    except Exception as e:
        logger.error(f"Error posting to social platforms: {e}")
        # Create failed records for all platforms
        for client in social_multiplexer.clients:
            social_message = SocialMessage(
                platform=client.platform_name,
                discord_post_id=discord_post.id,
                content=post_text,
                post_time=datetime.now(timezone.utc),
                success=False,
                error_message=str(e),
            )
            session.add(social_message)
        session.commit()


@bot.event
async def on_message(message):
    """Handle incoming Discord messages from focused channels."""
    # Don't respond to bot's own messages
    if message.author == bot.user:
        return

    # Check if message is from a focused channel
    SessionFactory = get_ops_session_factory()
    session = SessionFactory()
    try:
        focused_channel = (
            session.query(FocusedChannel)
            .filter_by(channel_id=str(message.channel.id), is_active=True)
            .first()
        )

        if focused_channel:
            logger.info(f"Message in focused channel {message.channel.name}:")
            logger.info(f"Author: {message.author}")
            logger.info(f"Content: {message.content}")

            # Log attachments if any
            if message.attachments:
                logger.info(f"Attachments: {len(message.attachments)}")
                for attachment in message.attachments:
                    logger.info(f"  - {attachment.filename}: {attachment.url}")

            # Process and bridge the message
            await process_message(message)
    finally:
        session.close()
