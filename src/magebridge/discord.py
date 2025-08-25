from datetime import datetime
import discord
from discord.ext import commands
import json

from .logger import logger
from .bluesky import bluesky_client
from .db import get_bridge_session_factory
from .models import FocusedChannel, DiscordPost, SocialMessage, Pass


# Bot setup
intents = discord.Intents.default()
intents.message_content = True  # Required to read message content
intents.messages = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Database session factory
SessionFactory = get_bridge_session_factory()


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
                    if channel.name == "modern-data-analysis" and hasattr(
                        channel, "history"
                    ):
                        focused_channel = FocusedChannel(
                            guild_id=str(guild.id),
                            channel_id=str(channel.id),
                            channel_name=channel.name,
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
    session = SessionFactory()
    try:
        # Get all active focused channels
        focused_channels = session.query(FocusedChannel).filter_by(is_active=True).all()

        for focused_channel in focused_channels:
            channel = bot.get_channel(int(focused_channel.channel_id))
            if not channel:
                logger.warning(f"Channel {focused_channel.channel_name} not found")
                continue

            # Get the last processed message time for this channel
            last_pass = (
                session.query(Pass)
                .filter_by(pass_type=f"history_{focused_channel.channel_id}")
                .order_by(Pass.start_time.desc())
                .first()
            )

            start_date = datetime(2025, 8, 15)
            if last_pass and last_pass.last_processed_time:
                start_date = last_pass.last_processed_time

            # Create a new pass record
            current_pass = Pass(
                pass_type=f"history_{focused_channel.channel_id}",
                start_time=datetime.now(),
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

                        # Bridge to social media (commented out for now)
                        # await process_message_for_social(message, discord_post)

                        messages_processed += 1
                        latest_time = max(latest_time, message.created_at)

                        logger.info(
                            f"[HISTORY] {message.created_at}: {message.author.display_name}: {message.id}"
                        )

                # Update pass record
                current_pass.end_time = datetime.now()
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
        await process_message_for_social(message, discord_post, session)

    except Exception as e:
        logger.error(f"Error processing message {message.id}: {e}")
        session.rollback()
    finally:
        session.close()


async def process_message_for_social(message, discord_post, session):
    """Process a Discord message for social media posting"""
    logger.info(f"Processing message from {message.author}: {message.content}")

    # Format the message for Bluesky
    bluesky_text = f"{message.content}"
    if len(bluesky_text) > 300:  # Bluesky character limit
        bluesky_text = bluesky_text[:297] + "..."

    # Handle images
    image_urls = []
    if message.attachments:
        for attachment in message.attachments:
            if attachment.content_type and attachment.content_type.startswith("image/"):
                image_urls.append(attachment.url)

    # Post to Bluesky
    success = False
    error_msg = None

    try:
        if image_urls:
            success = await bluesky_client.post_with_images(bluesky_text, image_urls)
        else:
            success = await bluesky_client.post_text(bluesky_text)
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error posting to Bluesky: {e}")

    # Record the social media post attempt
    social_message = SocialMessage(
        platform="bluesky",
        discord_post_id=discord_post.id,
        content=bluesky_text,
        post_time=datetime.now(),
        success=success,
        error_message=error_msg,
    )
    session.add(social_message)
    session.commit()

    if success:
        logger.info("✅ Successfully bridged message to Bluesky")
    else:
        logger.error("❌ Failed to bridge message to Bluesky")


@bot.event
async def on_message(message):
    """Handle incoming Discord messages from focused channels."""
    # Don't respond to bot's own messages
    if message.author == bot.user:
        return

    # Check if message is from a focused channel
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
