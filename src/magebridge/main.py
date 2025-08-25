import os
import discord
from discord.ext import commands
import asyncio
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
                except Exception as e:
                    logger.error(f"Error reading history: {e}")
                break

    if not found_channel:
        logger.warning(f"Channel '{TARGET_CHANNEL}' not found or not accessible")


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


async def main():
    token = os.getenv("DISCORD_MAGEBRIDGE_TOKEN")
    if not token:
        logger.error("DISCORD_MAGEBRIDGE_TOKEN environment variable not set")
        return

    try:
        await bot.start(token)
    except Exception as e:
        logger.error(f"Error starting bot: {e}")


if __name__ == "__main__":
    asyncio.run(main())
