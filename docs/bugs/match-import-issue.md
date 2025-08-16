# Match Import Issue

## Context

The system imports tournament data in two phases:
1. **Entry Import**: Tournament entries, players, deck cards from JSON files
2. **Match Import**: Match results from separate "rounds" files

When multiple tournaments have the same name on the same day (e.g., "Modern Challenge 32" at different times), the system needs to disambiguate which rounds file belongs to which tournament.

## Problem

After implementing tournament ID-based disambiguation for entry import, the match import phase broke. The issue occurs in the following sequence:

1. ✅ `ingest_entries.py` calls `find_rounds_file()` **with** `tournament_id` → successfully finds rounds file → creates tournament
2. ❌ `process_rounds_for_tournament()` calls `find_rounds_file()` **without** `tournament_id` → fails to find rounds file → no matches imported

This results in:
- Tournament entries created successfully
- Deck cards imported correctly  
- **Zero matches imported** despite rounds data existing
- Players show 0-0-0 records instead of actual win/loss data

## Evidence

**Tournament**: `modern-challenge-32-2025-07-2012803704` (ID: 12803704)

- **JSON Entry Data**: Shows 7 matchups for player "Xenowan"
- **Rounds File**: Contains 8 matches for "Xenowan" 
- **Database**: Shows 0 matches for "Xenowan"

**Example Query Result**:
```
Entry ID: 535dcc39-cb63-4c5d-920e-6091839812d5
Player: xenowan
Record: 0-0-0 (should be ~7-1-0 based on rounds data)
Deck Cards: 32 ✅
Matches: 0 ❌
```

## Root Cause

The `find_rounds_file()` function signature was updated to include `tournament_id` for disambiguation:

```python
# NEW signature (updated for entry import)
def find_rounds_file(
    date: datetime,
    format_name: str, 
    source: TournamentSource,
    warned_multiple: set = None,
    tournament_name: str = None,
    tournament_id: str = None,  # ← Added this parameter
    expected_winner: str = None,
) -> Optional[Path]:
```

But `process_rounds_for_tournament()` still calls it with the old signature:

```python
# OLD call (missing tournament_id)
rounds_path = find_rounds_file(
    tournament.date, format_name, tournament.source, None, tournament.name
)
```

## Proposed Solution

Update `process_rounds_for_tournament()` to extract and pass the tournament ID. Since the function doesn't have direct access to the original `TournamentFile` field, we need to either:

1. **Option A**: Extract tournament ID from existing data in the function
2. **Option B**: Pass tournament ID as a parameter from the calling code
3. **Option C**: Modify the function signature to accept the tournament ID

**Recommended approach**: Option B - Pass tournament ID from `ingest_entries.py` where we already have it extracted.

## Flow Diagram

See [match-import-flow.mermaid](./match-import-flow.mermaid) for visual representation of the issue.