"""
Core simulation engine for manabase analysis.

Based on Frank Karsten's 2013 Monte Carlo simulation methodology.
"""

from typing import Dict, Tuple
from .types import CardType, SimulationConfig
from .deck import Deck
from .mulligan import MulliganStrategy, VancouverMulligan


def simulate_hand(deck: Deck, hand_size: int) -> Tuple[int, int]:
    """
    Simulate drawing a hand.

    Args:
        deck: Deck to draw from
        hand_size: Number of cards to draw

    Returns:
        Tuple of (total_lands_in_hand, good_lands_in_hand)
    """
    lands = 0
    good_lands = 0

    for _ in range(hand_size):
        card = deck.draw_card()
        if card in (CardType.GOOD_LAND, CardType.OTHER_LAND):
            lands += 1
        if card == CardType.GOOD_LAND:
            good_lands += 1

    return lands, good_lands


def simulate_game(
    deck: Deck, config: SimulationConfig, mulligan_strategy: MulliganStrategy
) -> Tuple[int, int]:
    """
    Simulate one game (mulligans + draws to turn).

    Implements the exact algorithm from karsten_code_2013.java.

    Args:
        deck: Deck instance (will be reset as needed)
        config: Simulation configuration
        mulligan_strategy: Strategy for mulligan decisions

    Returns:
        Tuple of (total_lands_by_turn, good_lands_by_turn)
    """
    # Track the number of good lands we started with (for reset)
    initial_good_lands = deck.good_lands

    # Opening hand with mulligans
    hand_size = 7
    kept = False
    lands = 0
    good = 0

    # Mulligan loop (7 -> 6 -> 5 -> 4)
    while hand_size >= 4 and not kept:
        # Reset deck for this hand size
        deck.reset(config.total_lands, initial_good_lands, config.deck_size)

        # Draw hand
        lands, good = simulate_hand(deck, hand_size)

        # Check if we should keep
        if mulligan_strategy.should_keep(None, hand_size, lands):
            kept = True
        else:
            # Mulligan to smaller hand
            hand_size -= 1

    # If we never kept (got down to 3 or less), draw 4
    if not kept:
        deck.reset(config.total_lands, initial_good_lands, config.deck_size)
        lands, good = simulate_hand(deck, 4)

    # Draw for additional turns
    # Turn 1 on play = 0 additional draws
    # Turn 2 on play = 1 additional draw
    # Turn 1 on draw = 1 additional draw
    additional_draws = config.turn_allowed - 1
    if not config.on_play:
        additional_draws += 1

    for _ in range(additional_draws):
        card = deck.draw_card()
        if card in (CardType.GOOD_LAND, CardType.OTHER_LAND):
            lands += 1
        if card == CardType.GOOD_LAND:
            good += 1

    return lands, good


def run_simulation(
    config: SimulationConfig,
    good_lands_range: range = None,
    mulligan_strategy: MulliganStrategy = None,
    verbose: bool = True,
) -> Dict[int, float]:
    """
    Run full simulation across range of good_lands counts.

    This is the main entry point for generating results.

    Args:
        config: Base simulation configuration
        good_lands_range: Range of good_lands counts to test (defaults to total_lands in config)
        mulligan_strategy: Strategy to use (defaults to Vancouver)
        verbose: Whether to print progress

    Returns:
        Dictionary mapping {good_lands_count: probability}
    """
    if mulligan_strategy is None:
        mulligan_strategy = VancouverMulligan()

    # Set default range based on deck's total lands
    if good_lands_range is None:
        # Test from 6 up to the total number of lands in the deck
        good_lands_range = range(6, config.total_lands + 1)

    results = {}

    for good_lands in good_lands_range:
        # Skip impossible configurations
        if good_lands > config.total_lands:
            continue

        count_ok = 0
        count_conditional = 0

        # Run iterations
        for _ in range(config.iterations):
            deck = Deck(config.total_lands, good_lands, config.deck_size)
            lands, good = simulate_game(deck, config, mulligan_strategy)

            # Check success: do we have enough colored sources?
            if good >= config.good_lands_needed:
                count_ok += 1

            # Check conditional: did we hit land drops?
            if lands >= config.good_lands_needed:
                count_conditional += 1

        # Calculate conditional probability
        # P(have colored sources | hit land drops)
        probability = count_ok / count_conditional if count_conditional > 0 else 0.0
        results[good_lands] = probability

        if verbose:
            print(f"With {good_lands:2d} good lands: Prob={probability:.4f}")

    return results


def find_minimum_sources(
    config: SimulationConfig,
    target_probability: float = 0.90,
    mulligan_strategy: MulliganStrategy = None,
    verbose: bool = True,
) -> int:
    """
    Find minimum number of good lands to hit target probability.

    Args:
        config: Simulation configuration
        target_probability: Target probability (default 0.90 = 90%)
        mulligan_strategy: Strategy to use (defaults to Vancouver)
        verbose: Whether to print progress

    Returns:
        Minimum number of good lands needed
    """
    results = run_simulation(
        config, mulligan_strategy=mulligan_strategy, verbose=verbose
    )

    # Find first value >= target
    for good_lands in sorted(results.keys()):
        if results[good_lands] >= target_probability:
            return good_lands

    # If none found, return maximum tested
    return max(results.keys())
