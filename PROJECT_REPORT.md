# Magic: The Gathering Tournament Data Analysis MCP Server

## Project Context

This project aims to create a Model Context Protocol (MCP) server that enables AI assistants to answer complex questions about Magic: The Gathering tournament data. The data includes tournament results, deck compositions, matchup statistics, and meta evolution over time.

### Data Source
The project works with tournament data that includes:
- Tournament information (name, date, format, source)
- Player results (wins, losses, draws, archetype played)
- Detailed decklists (mainboard and sideboard composition)
- Individual match results between players
- Meta evolution tracking (new sets, bans, unbans)

## Project Objectives

### Primary Goals
1. **Enable Natural Language Queries**: Allow users to ask questions in plain English about tournament data
2. **Fast Response Times**: Ensure queries execute quickly enough for interactive chat experiences
3. **Comprehensive Analysis**: Support various types of analysis including:
   - Archetype win rates over any time period
   - Head-to-head matchup statistics
   - Card usage and popularity trends
   - Meta evolution tracking
   - Card performance influence (where feasible)

### Key Features
- **Flexible Querying**: Support both pre-built common queries and arbitrary SQL access
- **External Integration**: Connect to Scryfall API for detailed card information
- **Read-Only Access**: Ensure data integrity by limiting to read operations

## Technical Architecture

### Database Design

We chose a normalized SQL database structure for several reasons:
- **Query Performance**: Proper indexing enables fast aggregation queries
- **Flexibility**: SQL allows complex analytical queries
- **Familiarity**: SQL is well-understood by LLMs for query generation

#### Schema Overview

```sql
-- Core reference tables
formats (id, name)
meta_changes (id, format_id, date, change_type, description, card_name, set_code)
players (id, handle, normalized_handle)
cards (id, name, scryfall_id, oracle_id)
archetypes (id, name, color, companion)

-- Tournament data
tournaments (id, name, date, format_id, source, link)
rounds (id, tournament_id, number, stage) -- stage: SWISS|TOP8 (or similar)
tournament_entries (id, tournament_id, player_id, archetype_id, wins, losses, draws, decklist_url)
deck_cards (id, entry_id, card_id, count, board) -- board: MAIN|SIDE
matches (id, round_id, entry_id, opponent_entry_id, result, games_won, games_lost, mirror)
```

##### Matches: rounds/stage and symmetry (what this means)
- Rounds table records the pairing context (round number and stage such as SWISS or TOP8) for each match.
- Each match row is one side of a pairing; use mirror = true for same-archetype pairings to let queries exclude mirrors.
- To aggregate head-to-head without double-counting, group by unordered pairs using LEAST(entry_id, opponent_entry_id)/GREATEST(...), or enforce a unique constraint on that unordered pair at the round level.

### MCP Server Design

The MCP server exposes both high-level tools and low-level SQL access:

#### Tools
1. **`query_database(sql)`** - Execute arbitrary read-only SQL queries
2. **`get_archetype_winrate(archetype, start_date, end_date)`** - Pre-built archetype performance query
3. **`get_matchup_stats(archetype_a, archetype_b, start_date, end_date)`** - Head-to-head analysis
4. **`get_card_usage(card_name, start_date, end_date, archetype?)`** - Card popularity analysis
5. **`search_scryfall(card_name)`** - External API integration for card details
6. **`get_meta_timeline(format_id)`** - Track meta evolution

### Key Technical Decisions

#### 1. SQL Database vs. NoSQL

**Decision**: SQL (PostgreSQL recommended)

**Rationale**: 
- Tournament data is highly relational
- Need for complex aggregation queries
- Better support for analytical queries

#### 2. Normalized vs. Denormalized Schema

**Decision**: Normalized with strategic indexes

**Rationale**:
- Reduces data redundancy
- Maintains data integrity
- Allows flexible querying
- Performance maintained through proper indexing

#### 3. External Card Data via Scryfall

**Decision**: Use Scryfall API instead of storing card details

**Rationale**:
- Avoids maintaining large card database
- Always up-to-date card information
- Reduces storage requirements
- Scryfall's fuzzy search handles typos/variations

**Implementation**:
- Store cards keyed by oracle_id (UUID, unique) to deduplicate across printings; optionally keep a representative scryfall_id (print UUID).
- Keep name as CITEXT for case-insensitive display/lookup; normalize input names (trim, NFC).
- Ingest flow: check DB by name/cache → query Scryfall if missing → upsert by oracle_id → reference cards.id in deck_cards.

#### 4. Hybrid Tool Approach

**Decision**: Provide both specific tools and general SQL access

**Rationale**:
- Pre-built tools for common queries (faster, safer)
- SQL access for complex/unique queries
- Reduces chance of LLM generating incorrect SQL for common tasks
- Maintains flexibility for power users

#### 5. Mandatory Date Ranges

**Decision**: Require date parameters for card usage queries

**Rationale**:
- Prevents accidental full-table scans
- Most analysis needs temporal context
- Improves query performance
- Encourages meaningful analysis

## Implementation Considerations

### Performance Optimization
- Index on: archetype names, dates, card names, player names
- Implement query timeout limits
- Cache frequently accessed data (meta timeline, archetype list)

### Data Types and Constraints
- Use timestamptz for all dates; store source timezone if known.
- Convert numeric strings in input (e.g., "Wins": "5") to integers on ingest; reject or flag invalid rows.
- Add NOT NULL and foreign keys across the schema for referential integrity.
- Enforce unique constraints on (tournament_id, player_id) and (entry_id, card_id, board).
- Ensure UTF-8 and NFC normalization; use CITEXT for case-insensitive names/handles.

### Data Migration
- Parse JSON tournament data into normalized tables
- Handle card name variations (use Scryfall for normalization)
- Preserve all match-level detail

### Security
- Dedicated DB role with SELECT-only on the reporting schema; set default_transaction_read_only = on.
- Set statement_timeout (e.g., 2s–5s) for the read role; add row limits to ad-hoc SQL paths.
- Paginate tool outputs and enforce hard caps to keep responses tractable for LLMs.
- Rate limiting on MCP server and cache hot queries.
- No sensitive data exposure

### Future Enhancements
1. **Advanced Card Analysis**: Pre-computed influence metrics
2. **Trend Detection**: Automatic identification of rising/falling archetypes
3. **Graph Generation**: Visual representations of data trends

## Success Metrics
- Query response time < 2 seconds for common queries
- Support for 95% of user questions without custom SQL
- Accurate results validated against known tournament outcomes
- Successful integration with AI assistants (Claude, GPT, etc.)

## Conclusion

This MCP server design provides a robust foundation for AI-powered tournament data analysis. By combining structured data storage, flexible querying capabilities, and external API integration, the system can answer virtually any question about Magic: The Gathering tournament performance while maintaining fast response times suitable for interactive chat experiences.
