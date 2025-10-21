"""
Manabase simulation package.

Based on Frank Karsten's mana source calculations.
Uses London Mulligan (2019+ standard).
"""

from .types import CardType, SimulationConfig, STANDARD_LAND_COUNTS
from .deck import Deck
from .mulligan import MulliganStrategy, LondonMulligan
from .simulation import (
    simulate_hand,
    simulate_game,
    run_simulation,
    find_minimum_sources,
)

__all__ = [
    # Types
    "CardType",
    "SimulationConfig",
    "STANDARD_LAND_COUNTS",
    # Deck
    "Deck",
    # Mulligan
    "MulliganStrategy",
    "LondonMulligan",
    # Simulation
    "simulate_hand",
    "simulate_game",
    "run_simulation",
    "find_minimum_sources",
]
