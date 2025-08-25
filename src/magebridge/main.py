import os
import asyncio
from dotenv import load_dotenv

from .logger import logger
from .discord import bot


# Load environment variables
load_dotenv()


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
