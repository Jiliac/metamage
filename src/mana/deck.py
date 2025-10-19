"""
Deck representation and card drawing logic.

Based on Frank Karsten's 2013 Java implementation.
"""

import random
from .types import CardType


class Deck:
    """
    Represents a Magic deck for simulation.

    Tracks remaining cards and supports drawing without replacement.
    Implements the same algorithm as Karsten's Java code.
    """

    def __init__(self, total_lands: int, good_lands: int, deck_size: int):
        """
        Initialize deck.

        Args:
            total_lands: Total number of lands in deck
            good_lands: Number of lands that produce required color
            deck_size: Total cards in deck
        """
        self.total_lands = total_lands
        self.good_lands = good_lands
        self.deck_size = deck_size

    def reset(self, total_lands: int, good_lands: int, deck_size: int):
        """Reset deck to initial state."""
        self.total_lands = total_lands
        self.good_lands = good_lands
        self.deck_size = deck_size

    def draw_card(self) -> CardType:
        """
        Draw one card randomly from remaining deck.

        Updates deck state (draw without replacement).
        Uses the exact algorithm from Karsten's Java code.

        Returns:
            CardType indicating what was drawn
        """
        if self.deck_size == 0:
            raise ValueError("Cannot draw from empty deck")

        # Random integer from 1 to deck_size (inclusive)
        # This matches the Java: generator.nextInt(this.NumberOfCards) + 1
        rand = random.randint(1, self.deck_size)

        # Determine card type based on position thresholds
        good_land_cutoff = self.good_lands
        land_cutoff = self.total_lands

        if rand <= good_land_cutoff:
            # Drew a good land
            self.good_lands -= 1
            self.total_lands -= 1
            self.deck_size -= 1
            return CardType.GOOD_LAND

        elif rand <= land_cutoff:
            # Drew other land (produces wrong color)
            self.total_lands -= 1
            self.deck_size -= 1
            return CardType.OTHER_LAND

        else:
            # Drew spell (non-land)
            self.deck_size -= 1
            return CardType.SPELL
