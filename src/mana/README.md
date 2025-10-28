# Mana Base Calculator

A Python implementation of Frank Karsten's mana base simulation methodology for determining optimal colored mana source requirements in Magic: The Gathering deck construction.

## Overview

This module answers the question: **"How many sources of color X do I need to consistently cast spell Y by turn Z?"**

The implementation is based on Frank Karsten's pioneering work (2013-2022) using Monte Carlo simulation with conditional probability to calculate mana base requirements. This specific implementation is optimized for **Duel Commander (1v1)** format with London Mulligan rules.

## Methodology

### Core Philosophy

**Consistency Definition**: "Consistently cast" = **90% probability** of having the required colored mana available by a specific turn.

### Conditional Probability Approach

The key insight is to calculate probability **conditional on hitting land drops**, not across all possible hands:

```
P(cast spell on turn T) = P(have C colored sources by turn T | have T lands by turn T)
```

This separates two distinct problems:

- **Color screw**: Drawing the wrong color lands (what we're solving)
- **Mana screw**: Drawing too few lands overall (assumed to happen, conditional ignored)

### London Mulligan (2019+)

Unlike Karsten's original 2013 implementation (Vancouver Mulligan), this uses the modern London Mulligan rules:

1. Draw 7 cards
2. Decide to keep or mulligan
3. If keeping after mulligans: put N cards on bottom (where N = times mulliganed)
4. If mulliganing: shuffle and repeat

**Duel Commander Specific**: No free first mulligan (unlike multiplayer Commander). This format uses standard competitive London Mulligan rules, resulting in higher source requirements than 4-player EDH.

### Mulligan Strategy

**Keep conditions** (based on land count in hand):

- **7 cards**: Keep if 2-5 lands
- **6 cards**: Keep if 2-4 lands
- **5 cards**: Keep if 1-4 lands
- **4 cards**: Always keep

**Bottoming heuristic** (when keeping after mulligan):

- Prefer bottoming excess lands (beyond 3-4)
- Prefer bottoming "bad lands" (wrong color)
- Keep spells and good lands

### Monte Carlo Simulation

Each configuration runs **100,000 iterations** (fast) or **1,000,000 iterations** (production):

1. Draw opening hand of 7 cards
2. Apply mulligan logic (may mulligan to 6, 5, or 4)
3. If mulliganed, bottom N cards using heuristic
4. Draw additional cards for turns (turn 1 on play = 0 draws, turn 2 = 1 draw, etc.)
5. Check success: `CountOK` if enough colored sources
6. Check conditional: `CountConditional` if hit land drops
7. Calculate: `Probability = CountOK / CountConditional`

## Implementation Details

### Algorithm Fidelity

This implementation combines two proven approaches:

1. **Deck drawing algorithm**: Direct port from Karsten's 2013 Java code
   - Threshold-based random card selection
   - Drawing without replacement
   - Exact reproduction of original logic

2. **London Mulligan**: Based on teryror's 2022 Rust implementation
   - Modern mulligan rules (draw 7, then bottom N)
   - Evidence-based keep/mulligan thresholds
   - Practical bottoming heuristics

### Card Type Model

Cards are categorized into three types:

- **GOOD_LAND (1)**: Produces the required color (e.g., Plains for white spells)
- **OTHER_LAND (2)**: Land but produces wrong color (helps hit land drops)
- **SPELL (3)**: Non-land card (irrelevant to mana calculation)

### Mana Pattern Support

The module supports various mana cost patterns:

| Pattern | Description           | Example Spells                              |
| ------- | --------------------- | ------------------------------------------- |
| **C**   | Single colored        | Thoughtseize (B), Llanowar Elves (G)        |
| **CC**  | Double colored        | Counterspell (UU), Terminate (BR)           |
| **CCC** | Triple colored        | Cryptic Command (UUU), Boros Reckoner (RRR) |
| **1C**  | 1 generic + 1 colored | Lightning Bolt (R), Fatal Push (1B)         |
| **2C**  | 2 generic + 1 colored | Murder (2B), Cancel (2U)                    |
| **1CC** | 1 generic + 2 colored | Izzet Charm (1UR)                           |
| **2CC** | 2 generic + 2 colored | Supreme Verdict (2WW)                       |

Generic mana (numbers) can be paid with any land. Only colored pips require specific sources.

## Module Structure

```
src/mana/
├── __init__.py          # Public API exports
├── types.py             # Data structures (CardType, SimulationConfig)
├── deck.py              # Deck class with drawing logic
├── mulligan.py          # Mulligan strategies (London)
├── simulation.py        # Core Monte Carlo engine
├── generate_tables.py   # CLI tool for table generation
└── README.md            # This file
```

### Key Components

#### `types.py`

- `CardType`: Enum for card categorization
- `SimulationConfig`: Configuration for simulation runs
- `STANDARD_LAND_COUNTS`: Default land counts (60-card: 24, 99-card: 40)

#### `deck.py`

- `Deck`: Represents a Magic deck
- `draw_card()`: Draws cards without replacement using Karsten's algorithm

#### `mulligan.py`

- `MulliganStrategy`: Abstract base class
- `LondonMulligan`: Modern mulligan implementation with bottoming logic

#### `simulation.py`

- `simulate_hand()`: Draw and count initial hand
- `simulate_game()`: Full game with mulligans and turn-by-turn draws
- `run_simulation()`: Monte Carlo loop across multiple iterations
- `find_minimum_sources()`: Binary search for minimum sources hitting 90% threshold

#### `generate_tables.py`

- CLI tool for generating complete tables
- Pattern parsing and validation
- Formatted table output

## Usage

### As a Library

```python
from mana import SimulationConfig, find_minimum_sources

# Example: How many black sources for turn-1 Thoughtseize (B)?
config = SimulationConfig(
    deck_size=60,
    total_lands=24,
    good_lands_needed=1,  # Single B
    turn_allowed=1,
    iterations=100_000
)

min_sources = find_minimum_sources(config)
print(f"Need {min_sources} black sources")  # Expected: 14
```

### As a CLI Tool

```bash
# Generate table for 99-card Duel Commander
python -m mana.generate_tables --deck-size 99 --land-count 40

# Generate with high precision (1M iterations)
python -m mana.generate_tables --deck-size 99 --full

# Generate specific patterns only
python -m mana.generate_tables --patterns C,CC,1C,2C

# Generate for 60-card constructed
python -m mana.generate_tables --deck-size 60 --land-count 24
```

## Generated Data & Results

The simulation results are published as interactive tables at:
**`ui/src/app/mana/page.tsx`**

This web interface displays:

- Turn-by-turn source requirements
- Multiple mana patterns (C, CC, CCC, 1C, 2C, etc.)
- Different land counts (36-42 for 99-card)
- Pattern descriptions and CMC information

### Sample Results (99-card, 40 lands, Duel Commander)

| Turn | C   | CC  | CCC | 1C  | 2C  |
| ---- | --- | --- | --- | --- | --- |
| T1   | 23  | -   | -   | -   | -   |
| T2   | 21  | 33  | -   | 20  | -   |
| T3   | 20  | 31  | 37  | 19  | 17  |
| T4   | 18  | 29  | 36  | 17  | 16  |

_Note: These values are for Duel Commander (no free mulligan). Multiplayer Commander would have ~3-4 fewer sources required._

## Validation

### Expected Baseline Results (60-card, 24 lands)

To validate the implementation, compare against Karsten's 2013 published tables:

| Spell Cost | Turn   | Expected Sources |
| ---------- | ------ | ---------------- |
| C          | Turn 1 | 14               |
| C          | Turn 2 | 13               |
| CC         | Turn 2 | 20               |
| CC         | Turn 4 | 18               |
| CCC        | Turn 3 | 22               |

Acceptable tolerance: ±1 source due to Monte Carlo variance.

### Validation Against Real Decks

The implementation has been validated against tournament-winning decklists from the metamage database (99,725+ decklists), confirming that top-performing decks generally meet or exceed calculated source requirements.

## Technical Notes

### Assumptions

1. **Only lands produce colored mana** (no Birds of Paradise, Sol Ring, etc.)
   - For mana rocks/creatures, count as fractional sources (0.5x)
2. **All sources treated equally** (no tapped vs untapped distinction in base simulation)
3. **On the play** (7 cards + 1 draw per turn after T1)
4. **Duel Commander mulligan** (standard London, no free mulligan)

### Performance

- **100k iterations**: ~5-10 seconds per configuration
- **1M iterations**: ~30-60 seconds per configuration
- **Full table generation** (all patterns, all turns): ~2-4 hours (100k), ~10-20 hours (1M)

### Extending the Code

To add new mulligan strategies:

```python
from mana.mulligan import MulliganStrategy

class MyCustomMulligan(MulliganStrategy):
    def should_keep(self, hand, hand_size, lands_in_hand):
        # Your logic here
        return True

    def choose_cards_to_bottom(self, hand, num_to_bottom):
        # Return list of indices to bottom
        return list(range(num_to_bottom))
```

To add new card types (MDFCs, etc.):

```python
from enum import Enum

class CardType(Enum):
    GOOD_LAND = 1
    OTHER_LAND = 2
    SPELL = 3
    MDFC_UNTAPPED = 4  # Counts as 0.74 lands (from community research)
```

## References

### Primary Sources

1. **Frank Karsten (2013)**: "How Many Colored Mana Sources Do You Need to Consistently Cast Your Spells?"
   - Original methodology and 2013 baseline tables
   - Java simulation code (ported to Python in this module)

2. **teryror (2022)**: Rust implementation with London Mulligan
   - GitHub Gist: Modern mulligan logic
   - Extended pattern support

### Documentation

- `docs/karsten/TECHNICAL_REPORT.md` - Comprehensive analysis of Karsten's methodology
- `docs/karsten/DUEL_COMMANDER_NOTES.md` - Format-specific adaptations
- `docs/karsten/SIMULATION_SCOPE.md` - Scope and validation plan

### Web Interface

- `ui/src/app/mana/page.tsx` - Interactive table viewer with published results

## License

This implementation is based on publicly documented mathematical methods. Frank Karsten's original work is credited and referenced throughout.

---

**Implementation**: metamage project, October 2025
**Format**: Duel Commander (1v1)
**Mulligan Rules**: London (2019+)
**Consistency Target**: 90% probability
