# MetaMage Project Overview

MetaMage is a comprehensive Magic: The Gathering tournament data analysis system consisting of four major components that work together to provide tournament insights and meta analysis.

## System Architecture

```
Tournament Data Sources
         ↓
   Data Ingestion Pipeline
         ↓
     SQLite Database
         ↓
      MCP Server (API)
         ↓
   Discord Bot & CLI Chat
         ↓
    Visualization System
```

## Components

### 1. MCP Server (`src/mcp_server/`)
**Purpose**: FastMCP-based API server providing structured access to tournament data

**Key Features**:
- Read-only SQLite database access with security hardening
- 15+ specialized tools for tournament analysis
- Support for HTTP and stdio transports
- Comprehensive MTG format coverage (Modern, Legacy, Standard, etc.)

**Key Files**:
- `mcp.py` - Main MCP server configuration and tool registration
- `server.py` - Server entry point with transport options
- Individual tool modules (query_db_any.py, meta_report.py, etc.)

**Technology**: Python, FastMCP, SQLite

### 2. Discord Bot + CLI Chat (`src/cli_chat/`)
**Purpose**: Natural language interfaces for querying tournament data

**Key Features**:
- Discord slash commands (`/mage`, `/mageping`)
- Local CLI chat interface
- ReAct agent powered by Claude Sonnet 4
- Automatic MCP tool selection and chaining
- Response formatting and length management

**Key Files**:
- `discord_bot.py` - Discord bot with slash command interface
- `chat_agent.py` - Local CLI chat agent
- `mcp_client.py` - MCP client utilities
- `system_prompt.py` - Agent system prompt configuration

**Technology**: Python, Discord.py, LangChain, Claude API

### 3. Data Ingestion Pipeline (`src/ingest/`)
**Purpose**: Process tournament data from JSON sources into normalized SQLite database

**Key Features**:
- Multi-format tournament data support
- Player, archetype, and card normalization
- Match result processing and validation
- Date-based filtering and incremental updates
- SQLAlchemy ORM with Alembic migrations

**Key Files**:
- `ingest_tournament_data.py` - Main ingestion entry point
- `ingest_entries.py` - Tournament and match data processing
- `ingest_archetypes.py` - Archetype normalization
- `ingest_players.py` - Player data processing

**Technology**: Python, SQLAlchemy, Alembic, PostgreSQL/SQLite

### 4. Visualization System (`visualize/`)
**Purpose**: Statistical analysis and plot generation for tournament meta analysis

**Key Features**:
- Wilson confidence intervals for win rates
- Cluster-robust standard errors by player
- Statistical tier rankings
- Meta presence and matchup analysis
- Publication-ready plots (presence, win rates, matchup matrices)

**Key Files**:
- `analysis.R` - Statistical analysis functions
- `run.R` - Main visualization runner
- `plot_*.R` - Individual plot generators
- `params.R` - Configuration parameters

**Technology**: R, ggplot2, dplyr, estimatr

## Data Flow

1. **Raw Data**: Tournament results from MTGO, Melee, and other sources
2. **Ingestion**: JSON tournament data processed into normalized SQLite schema
3. **API Layer**: MCP server provides structured access to database
4. **Query Interface**: Discord bot and CLI allow natural language queries
5. **Analysis**: R scripts generate statistical insights and visualizations

## Database Schema

Core tables include:
- `formats` - MTG formats (Modern, Legacy, etc.)
- `tournaments` - Tournament metadata and results
- `players` - Player information and handles
- `archetypes` - Deck archetypes per format
- `tournament_entries` - Player performances in tournaments
- `matches` - Individual match results
- `deck_cards` - Deck compositions (main/sideboard)
- `cards` - Magic card database
- `meta_changes` - Format changes (bans, set releases)

## Component Interactions

- **MCP Server** exposes database via tools that Discord bot and CLI consume
- **Visualization System** queries database directly for statistical analysis
- **Ingestion Pipeline** populates database from tournament data sources
- **All components** share the same SQLite database and data model

## Configuration

Key environment variables:
- `TOURNAMENT_DB_PATH` - Database file location
- `ANTHROPIC_API_KEY` - For Claude-powered chat agents
- `DISCORD_BOT_TOKEN` - For Discord bot functionality

## Getting Started

1. **For Users**: Follow README.md to run MCP server and chat clients
2. **For Developers**: This PROJECT.md provides the complete system overview
3. **For Data**: Contact valentinmanes@outlook.fr for database access
4. **For Analysis**: Use R scripts in `visualize/` for custom analysis