"""
Types and configuration for manabase simulation.

Based on Frank Karsten's 2013 methodology.
"""

from dataclasses import dataclass
from enum import Enum


class CardType(Enum):
    """
    Card types for simulation.

    GOOD_LAND: Produces the required color (e.g., Plains for white spells)
    OTHER_LAND: Land but doesn't produce required color
    SPELL: Non-land card
    """

    GOOD_LAND = 1
    OTHER_LAND = 2
    SPELL = 3


# Standard deck configurations (deck_size -> land_count)
STANDARD_LAND_COUNTS = {
    60: 24,  # Constructed (Standard/Modern/Pioneer)
    99: 40,  # Duel Commander
}


@dataclass
class SimulationConfig:
    """Configuration for manabase simulation."""

    deck_size: int
    """Total cards in deck (60 or 99)"""

    total_lands: int
    """Total lands in deck"""

    good_lands_needed: int
    """Required colored sources (1 for C, 2 for CC, 3 for CCC)"""

    turn_allowed: int
    """Turn by which to cast the spell"""

    iterations: int = 1_000_000
    """Number of simulation iterations"""

    on_play: bool = True
    """True if on play, False if on draw"""

    @classmethod
    def from_deck_size(
        cls,
        deck_size: int,
        good_lands_needed: int,
        turn_allowed: int,
        iterations: int = 1_000_000,
        on_play: bool = True,
        land_count: int = None,
    ):
        """Create config with standard land count for deck size.

        Args:
            deck_size: Total cards in deck (60 or 99)
            good_lands_needed: Required colored sources
            turn_allowed: Turn by which to cast
            iterations: Number of simulation iterations
            on_play: True if on play, False if on draw
            land_count: Override default land count (optional)
        """
        if land_count is None:
            if deck_size not in STANDARD_LAND_COUNTS:
                raise ValueError(
                    f"Unknown deck size {deck_size}. "
                    f"Valid sizes: {list(STANDARD_LAND_COUNTS.keys())}"
                )
            land_count = STANDARD_LAND_COUNTS[deck_size]

        return cls(
            deck_size=deck_size,
            total_lands=land_count,
            good_lands_needed=good_lands_needed,
            turn_allowed=turn_allowed,
            iterations=iterations,
            on_play=on_play,
        )
