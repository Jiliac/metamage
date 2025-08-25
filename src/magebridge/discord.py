import discord
from discord.ext import commands

from .logger import logger
from .bluesky import bluesky_client


# Bot setup
intents = discord.Intents.default()
intents.message_content = True  # Required to read message content
intents.messages = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Target channel name to monitor
TARGET_CHANNEL = "modern-data-analysis"


@bot.event
async def on_ready():
    logger.info(f"{bot.user} has connected to Discord!")
    logger.info(f"Monitoring channel: {TARGET_CHANNEL}")

    # Debug: List guild info only
    logger.info(f"Bot is in {len(bot.guilds)} guild(s)")
    for guild in bot.guilds:
        logger.info(f"Guild: {guild.name} (ID: {guild.id})")

    if len(bot.guilds) == 0:
        logger.error(
            "Bot is not in any servers! Check the invite URL and make sure the bot was added to the server."
        )

    # Read message history from Aug 15, 2025
    from datetime import datetime

    start_date = datetime(2025, 8, 15)

    found_channel = False
    for guild in bot.guilds:
        for channel in guild.channels:
            if channel.name == TARGET_CHANNEL and hasattr(channel, "history"):
                found_channel = True
                logger.info(
                    f"Found target channel! Reading history from {TARGET_CHANNEL} since {start_date.date()}"
                )
                try:
                    async for message in channel.history(
                        after=start_date, oldest_first=True
                    ):
                        logger.info(
                            f"[HISTORY] {message.created_at}: {message.author}: {message.content}"
                        )
                        if message.attachments:
                            for attachment in message.attachments:
                                logger.info(
                                    f"  [HISTORY] Attachment: {attachment.filename}: {attachment.url}"
                                )

                        # Bridge historical messages to Bluesky too
                        await process_message(message)
                except Exception as e:
                    logger.error(f"Error reading history: {e}")
                break

    if not found_channel:
        logger.warning(f"Channel '{TARGET_CHANNEL}' not found or not accessible")


async def process_message(message):
    """Process a Discord message and post it to Bluesky"""
    logger.info(f"Processing message from {message.author}: {message.content}")

    # Format the message for Bluesky
    # Include author info in the post
    bluesky_text = f"{message.content}"
    if len(bluesky_text) > 300:  # Bluesky character limit
        bluesky_text = bluesky_text[:297] + "..."

    # Handle images
    image_urls = []
    if message.attachments:
        for attachment in message.attachments:
            if attachment.content_type and attachment.content_type.startswith("image/"):
                image_urls.append(attachment.url)
                logger.info(f"Found image: {attachment.filename}")

    # Post to Bluesky
    if image_urls:
        success = await bluesky_client.post_with_images(bluesky_text, image_urls)
    else:
        success = await bluesky_client.post_text(bluesky_text)

    if success:
        logger.info("✅ Successfully bridged message to Bluesky")
    else:
        logger.error("❌ Failed to bridge message to Bluesky")


@bot.event
async def on_message(message):
    # Don't respond to bot's own messages
    if message.author == bot.user:
        return

    # Check if message is from the target channel
    if message.channel.name == TARGET_CHANNEL:
        logger.info(f"Message in {TARGET_CHANNEL}:")
        logger.info(f"Author: {message.author}")
        logger.info(f"Content: {message.content}")

        # Log attachments if any
        if message.attachments:
            logger.info(f"Attachments: {len(message.attachments)}")
            for attachment in message.attachments:
                logger.info(f"  - {attachment.filename}: {attachment.url}")

        # Bridge to Bluesky
        await process_message(message)
