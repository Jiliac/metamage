"""
Mulligan strategies for simulation.

Implements London Mulligan (2019+ standard).
"""

from abc import ABC, abstractmethod
from typing import List, Tuple
from .types import CardType


class MulliganStrategy(ABC):
    """Abstract base class for mulligan decisions."""

    @abstractmethod
    def should_keep(
        self, hand: List[CardType], hand_size: int, lands_in_hand: int
    ) -> bool:
        """
        Decide whether to keep this hand.

        Args:
            hand: List of cards in hand (currently unused, for future extensions)
            hand_size: Number of cards in hand
            lands_in_hand: Number of lands in hand

        Returns:
            True if should keep, False if should mulligan
        """
        pass


class LondonMulligan(MulliganStrategy):
    """
    London Mulligan strategy (2019+).

    Based on teryror's Rust implementation:
    https://gist.github.com/teryror/57a3099a6566d1ab75bd3fd515ab0380

    Keep rules (same as old Vancouver):
    - 7 cards: keep if 2-5 lands
    - 6 cards: keep if 2-4 lands
    - 5 cards: keep if 1-4 lands
    - 4 cards: always keep

    Key difference from Vancouver:
    - Always draw 7 cards each mulligan (not 7, 6, 5, 4)
    - After keeping, put N cards on bottom of library (N = mulligans taken)
    """

    def should_keep(
        self, hand: List[CardType], hand_size: int, lands_in_hand: int
    ) -> bool:
        """
        Decide whether to keep this hand.

        Keep rules from Rust implementation: [2..6, 2..5, 1..5, 0..5]
        """
        if hand_size == 7:
            return 2 <= lands_in_hand <= 5
        elif hand_size == 6:
            return 2 <= lands_in_hand <= 4
        elif hand_size == 5:
            return 1 <= lands_in_hand <= 4
        else:  # 4 or fewer
            return True

    def choose_cards_to_bottom(
        self,
        lands_in_hand: int,
        good_lands_in_hand: int,
        hand_size: int,
        num_to_bottom: int,
    ) -> Tuple[int, int]:
        """
        Choose which cards to put on bottom of library.

        Heuristic from teryror's Rust implementation:
        - Bottom lands when: lands > hand_size/2 AND lands > 2
        - Prefer bottoming bad lands (non-colored) over good lands

        Args:
            lands_in_hand: Total lands in hand
            good_lands_in_hand: Lands that produce required color
            hand_size: Current hand size (always 7 with London)
            num_to_bottom: Number of cards to put on bottom

        Returns:
            Tuple of (total_lands_to_bottom, good_lands_to_bottom)
        """
        lands_to_bottom = 0
        good_lands_to_bottom = 0

        for _ in range(num_to_bottom):
            # Should we bottom a land?
            # Heuristic: bottom lands if we have too many
            if lands_in_hand > (hand_size // 2) and lands_in_hand > 2:
                lands_to_bottom += 1

                # Calculate bad lands (lands that don't produce required color)
                bad_lands = lands_in_hand - good_lands_in_hand

                if bad_lands > 0:
                    # Prefer bottoming a bad land (don't touch good_lands count)
                    lands_in_hand -= 1
                else:
                    # Only good lands left, must bottom one
                    good_lands_to_bottom += 1
                    good_lands_in_hand -= 1
                    lands_in_hand -= 1
            # else: bottom a spell (doesn't affect our land counts)

        return lands_to_bottom, good_lands_to_bottom
