"""
Core simulation engine for manabase analysis.

Based on Frank Karsten's 2013 Monte Carlo simulation methodology.
"""

from typing import Dict, Tuple
from .types import CardType, SimulationConfig
from .deck import Deck
from .mulligan import MulliganStrategy, LondonMulligan


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
    Simulate one game with London Mulligan (2019+).

    London Mulligan:
    - Always draw 7 cards
    - Keep or mulligan based on hand quality
    - If keeping after mulligan, put N cards on bottom (N = mulligans taken)
    - Repeat until kept or reached 4 mulligans

    Args:
        deck: Deck instance (will be reset as needed)
        config: Simulation configuration
        mulligan_strategy: Strategy for mulligan decisions (LondonMulligan)

    Returns:
        Tuple of (total_lands_by_turn, good_lands_by_turn)
    """
    # Track the number of good lands we started with (for reset)
    initial_good_lands = deck.good_lands

    # London Mulligan loop (always draw 7)
    kept = False
    lands = 0
    good = 0

    for mulligan_count in range(4):  # 0, 1, 2, 3 mulligans
        # Reset deck
        deck.reset(config.total_lands, initial_good_lands, config.deck_size)

        # London: always draw 7 cards
        lands, good = simulate_hand(deck, 7)

        # Check if we should keep
        if mulligan_strategy.should_keep(None, 7, lands):
            kept = True

            # If we mulliganed, put cards on bottom
            if mulligan_count > 0:
                lands_to_bottom, good_lands_to_bottom = (
                    mulligan_strategy.choose_cards_to_bottom(
                        lands, good, 7, mulligan_count
                    )
                )
                lands -= lands_to_bottom
                good -= good_lands_to_bottom

            break

    # If we never kept (mulliganed 4 times), draw and keep 4
    if not kept:
        deck.reset(config.total_lands, initial_good_lands, config.deck_size)
        lands, good = simulate_hand(deck, 4)
        # Don't bottom cards on a 4-card hand

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
        mulligan_strategy: Strategy to use (defaults to London)
        verbose: Whether to print progress

    Returns:
        Dictionary mapping {good_lands_count: probability}
    """
    if mulligan_strategy is None:
        mulligan_strategy = LondonMulligan()

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

        # Run iterations
        for _ in range(config.iterations):
            deck = Deck(config.total_lands, good_lands, config.deck_size)
            lands, good = simulate_game(deck, config, mulligan_strategy)

            # Check success: do we have enough colored sources?
            if good >= config.good_lands_needed:
                count_ok += 1

        # Calculate unconditional probability
        # P(have colored sources by turn T)
        # This includes both hitting land drops AND having the right colors
        probability = count_ok / config.iterations
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
        mulligan_strategy: Strategy to use (defaults to London)
        verbose: Whether to print progress

    Returns:
        Minimum number of good lands needed, or -1 if target is impossible to reach
    """
    results = run_simulation(
        config, mulligan_strategy=mulligan_strategy, verbose=verbose
    )

    # Find first value >= target
    for good_lands in sorted(results.keys()):
        if results[good_lands] >= target_probability:
            return good_lands

    # If none found, return -1 to indicate impossible
    if verbose:
        max_lands = max(results.keys())
        max_prob = results[max_lands]
        print(f"\n⚠️  WARNING: Target {target_probability:.0%} not achievable!")
        print(f"   Maximum with {max_lands} sources: {max_prob:.1%}")
    return -1
