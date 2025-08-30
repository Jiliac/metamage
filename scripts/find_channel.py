#!/usr/bin/env python3
import os
import asyncio
import aiohttp
from dotenv import load_dotenv

load_dotenv()


async def find_s_data_channel():
    token = os.getenv("DISCORD_MAGEBRIDGE_TOKEN")
    if not token:
        print("DISCORD_MAGEBRIDGE_TOKEN not found in environment")
        return

    guild_id = "975020015650742302"  # PERF' Construit guild ID

    headers = {"Authorization": f"Bot {token}", "Content-Type": "application/json"}

    async with aiohttp.ClientSession() as session:
        # Get all channels in the guild
        async with session.get(
            f"https://discord.com/api/v10/guilds/{guild_id}/channels", headers=headers
        ) as response:
            if response.status == 200:
                channels = await response.json()

                print("Channels in PERF' Construit guild:")
                for channel in channels:
                    print(
                        f"  {channel['name']} (ID: {channel['id']}, Type: {channel['type']})"
                    )

                    # Look for s-data channel
                    if "s-data" in channel["name"].lower():
                        print("\n🎯 Found s-data channel!")
                        print(f"   Name: {channel['name']}")
                        print(f"   ID: {channel['id']}")
                        print(f"   Type: {channel['type']}")
            else:
                print(f"Error: {response.status} - {await response.text()}")


if __name__ == "__main__":
    asyncio.run(find_s_data_channel())
