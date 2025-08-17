# The Tool Chaining Problem: A Case Study

## Executive Summary

This document analyzes a critical issue in MCP tool design: **tool chaining discoverability**. Using the failed "Psychic Frog in Domain Zoo" query as a case study, we examine why LLMs struggle with complex multi-step analyses despite having all necessary tools available.

**Key Finding**: The tools work perfectly in isolation but lack documentation showing how to orchestrate them for complex workflows.

## Problem Statement

### The Query That Failed
**User Request**: "In the last 6 months, can you look at how much Domain Zoo was playing Psychic Frog? Were the versions that were playing it having a stronger winrate?"

**Agent Response**: "There was no entry with zoo playing frog"

**Reality**: 74 Domain Zoo entries played Psychic Frog with a 51.08% winrate vs 51.61% without it.

### Why This Matters
This isn't a missing feature problem—it's a **tool orchestration problem**. The failure represents a broader issue where LLMs can't discover and chain existing tools for complex analysis.

## Case Study: The Failed Analysis

### What the Agent Should Have Done

1. **Step 1**: Search for the card
   ```python
   search_card("Psychic Frog") 
   # Returns: card_id, name, etc.
   ```

2. **Step 2**: Find the archetype  
   ```python
   get_archetype_overview("Domain Zoo")
   # Returns: archetype_id via fuzzy matching
   ```

3. **Step 3**: Analyze card adoption in archetype
   ```sql
   -- Query entries with the card
   SELECT COUNT(*), AVG(wins), AVG(losses) 
   FROM tournament_entries te
   JOIN deck_cards dc ON te.id = dc.entry_id  
   WHERE te.archetype_id = :archetype_id 
   AND dc.card_id = :card_id
   ```

4. **Step 4**: Compare with entries without the card
   ```sql
   -- Query entries without the card  
   SELECT COUNT(*), AVG(wins), AVG(losses)
   FROM tournament_entries te
   WHERE te.archetype_id = :archetype_id
   AND te.id NOT IN (SELECT entry_id FROM deck_cards WHERE card_id = :card_id)
   ```

### What Actually Happened

The agent attempted some form of search but failed to:
- Properly chain the tools together
- Understand that multiple tools needed to be orchestrated  
- Recognize that `query_db_any()` could handle the complex SQL analysis
- Use the correct case-insensitive search patterns

### Direct SQL Verification

When we ran the analysis manually:

```sql
-- Domain Zoo WITH Psychic Frog (last 6 months)
-- Result: 74 entries, 51.08% winrate (189W-181L)

-- Domain Zoo WITHOUT Psychic Frog (last 6 months)  
-- Result: 765 entries, 51.61% winrate (1983W-1859L)
```

**Conclusion**: Psychic Frog versions were slightly weaker, not stronger.

## Root Cause Analysis

### Issue 1: Tool Documentation Lacks Workflow Context

**Current Documentation Pattern**:
```python
@mcp.tool
def search_card(query: str) -> Dict[str, Any]:
    """Search a card by partial name in the local DB."""
```

**Problem**: No indication of how this fits into larger workflows.

**Better Pattern**:
```python
@mcp.tool  
def search_card(query: str) -> Dict[str, Any]:
    """
    Search a card by partial name in the local DB.
    
    Workflow Integration:
    - Use card_id with query_db_any() for deck analysis
    - Combine with get_archetype_overview() for adoption rates
    - Chain with get_card_presence() for meta analysis
    
    Example: Analyze card in archetype
    1. search_card("Psychic Frog") → get card_id  
    2. get_archetype_overview("Domain Zoo") → get archetype_id
    3. query_db_any() → complex adoption/winrate analysis
    """
```

### Issue 2: No Orchestration Examples

**Missing**: Clear examples of common multi-tool workflows in documentation.

**Needed**: A "workflows" section showing typical chaining patterns:
- Card adoption in archetype
- Matchup analysis over time  
- Meta shift detection
- Performance comparisons

### Issue 3: query_db_any() Underutilized

The `query_db_any()` tool can handle complex analysis but lacks:
- Common query templates
- Schema documentation  
- Example SQL for frequent use cases

### Issue 4: System Prompt Gaps

The system prompt doesn't explicitly guide LLMs to:
- Consider multi-step workflows for complex queries
- Use `query_db_any()` for custom analysis
- Chain tools systematically

## Current State: Available Tools

| Tool | Purpose | Chaining Potential |
|------|---------|-------------------|
| `search_card()` | Find card by name | → High (provides card_id) |
| `get_archetype_overview()` | Find archetype | → High (provides archetype_id) |
| `query_db_any()` | Custom SQL queries | → Very High (flexible analysis) |
| `get_card_presence()` | Card adoption rates | → Medium (format-level) |
| `get_archetype_winrate()` | Archetype performance | → Medium (time-bound) |

**Key Insight**: We have all the building blocks; they just need better "assembly instructions."

## Solution Approaches

### Option A: Enhanced Documentation (Recommended)

**Approach**: Improve tool docstrings with workflow examples and chaining guidance.

**Implementation**:
1. Add "Related Tools" sections to each tool
2. Include common workflow patterns in docstrings
3. Create a "Tool Chaining Guide" documentation page
4. Add SQL templates to `query_db_any()` for common scenarios

**Pros**: 
- Fast to implement
- Helps with ALL future complex queries
- Maintains existing tool architecture
- Scales to new tools

**Cons**:
- Relies on LLM reading documentation carefully
- May not solve all edge cases

### Option B: Composite Analysis Tools

**Approach**: Create dedicated tools for common complex workflows.

**Example**: `analyze_card_in_archetype(card_name, archetype_name, date_range)`

**Pros**:
- Guaranteed to work for specific scenarios
- Single tool call for complex analysis
- Clear, predictable results

**Cons**:
- Tool proliferation (N×M complexity)
- Rigid - doesn't handle variations well
- Maintenance overhead

### Option C: Workflow Prompting

**Approach**: Enhance system prompt with explicit workflow guidance.

**Implementation**:
```
For complex analysis queries involving multiple entities:
1. Break down the query into components
2. Use search tools to find entity IDs  
3. Use query_db_any() for custom analysis
4. Always verify results with direct SQL when possible
```

**Pros**:
- No code changes required
- Flexible approach
- Educational for the LLM

**Cons**:
- Prompt engineering is fragile
- Inconsistent results across different queries

## Recommendations

### Primary Recommendation: Enhanced Documentation (Option A)

**Rationale**: 
- Addresses the root cause (discoverability)
- Scales to all future tools and queries
- Preserves flexibility while adding guidance
- Cost-effective implementation

### Implementation Plan

1. **Phase 1**: Update existing tool docstrings
   - Add workflow examples to key tools
   - Include "Related Tools" sections
   - Add common SQL patterns to `query_db_any()`

2. **Phase 2**: Create workflow documentation  
   - "Tool Chaining Guide" with common patterns
   - Schema reference for `query_db_any()`
   - Real examples from failed queries

3. **Phase 3**: System prompt enhancement
   - Add explicit guidance for complex queries
   - Include workflow thinking patterns
   - Reference the chaining documentation

### Success Metrics

- **Immediate**: Chat agent successfully handles the "Psychic Frog in Zoo" query
- **Medium-term**: Reduced failures on multi-step analysis queries  
- **Long-term**: New tools automatically include workflow documentation

## Conclusion

The "Psychic Frog in Domain Zoo" query failure reveals a systemic issue: **we have powerful tools but poor orchestration guidance**. This isn't unique to MTG analysis—it's a common problem in any MCP tool ecosystem.

The solution isn't more tools; it's **better tool relationship documentation**. By making workflows discoverable, we can transform isolated tools into a cohesive analysis platform.

**Next Step**: Implement enhanced documentation starting with the tools involved in this case study, then expand the pattern to all MCP tools.

---

*This document serves as both a post-mortem and a blueprint for preventing similar tool chaining failures in the future.*