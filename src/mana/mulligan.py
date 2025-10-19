"""
Mulligan strategies for simulation.

Implements Vancouver Mulligan (2013) and placeholder for London (2019+).
"""

from abc import ABC, abstractmethod
from typing import List
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


class VancouverMulligan(MulliganStrategy):
    """
    Vancouver Mulligan strategy (pre-2019).

    Rules from Karsten's 2013 code:
    - 7 cards: keep if 2-5 lands
    - 6 cards: keep if 2-4 lands
    - 5 cards: keep if 1-4 lands
    - 4 cards: always keep
    """

    def should_keep(
        self, hand: List[CardType], hand_size: int, lands_in_hand: int
    ) -> bool:
        """
        Implement Vancouver Mulligan decision.

        Matches the exact logic from karsten_code_2013.java.
        """
        if hand_size == 7:
            return 2 <= lands_in_hand <= 5
        elif hand_size == 6:
            return 2 <= lands_in_hand <= 4
        elif hand_size == 5:
            return 1 <= lands_in_hand <= 4
        else:  # 4 or fewer
            return True


class LondonMulligan(MulliganStrategy):
    """
    London Mulligan strategy (2019+).

    TODO: Implement based on 2020/2022 Karsten articles when available.
    For now, this raises NotImplementedError.
    """

    def should_keep(
        self, hand: List[CardType], hand_size: int, lands_in_hand: int
    ) -> bool:
        raise NotImplementedError(
            "London Mulligan logic pending 2020/2022 Karsten articles. "
            "Use VancouverMulligan for 2013 baseline."
        )

    def choose_cards_to_bottom(
        self, hand: List[CardType], num_to_bottom: int
    ) -> List[int]:
        """
        Select which cards to put on bottom (indices).

        TODO: Implement card selection logic when articles available.
        """
        raise NotImplementedError("Card selection logic pending 2020/2022 articles.")
