# MTG Tournament CLI Agent

A command-line agent for querying MTG tournament data using LiteLLM with Model Context Protocol (MCP) tools.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set environment variables:**
   ```bash
   export ANTHROPIC_API_KEY="your-anthropic-key"
   export TOURNAMENT_DB_PATH="/path/to/tournament.db"  # Optional
   ```

3. **Start LiteLLM proxy (optional for advanced features):**
   ```bash
   litellm --config config.yaml --port 4000
   ```

## Usage

### Basic Queries
```bash
python agent.py "Find the best Modern deck by winrate since 2024-01-01"
python agent.py "What are the top 5 Modern archetypes by match count?"
python agent.py "Show me tournament data for the last 6 months"
```

### Streaming Mode
```bash
python agent.py --stream "Compare Burn vs Tron winrates in 2024"
```

### Custom Config
```bash
python agent.py --config /path/to/config.yaml "Your query here"
```

## Available Tools

The agent has access to two main tools:

1. **query_database(sql, limit)** - Execute SELECT-only queries
2. **get_archetype_winrate(archetype_id, start_date, end_date, exclude_mirror)** - Get detailed statistics

## Example Queries

- "Which Modern archetype has the highest winrate in recent tournaments?"
- "Show me match data for Burn decks from January 2024"
- "Compare the performance of Tron vs Jund in head-to-head matches"
- "What tournaments were held in the last month?"
- "Find the most successful deck archetypes by tournament wins"

## Architecture

- Uses LiteLLM for universal LLM provider support
- Connects to MCP server via stdio transport
- Provides streaming and non-streaming response modes
- Includes comprehensive error handling and user-friendly output