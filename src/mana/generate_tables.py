#!/usr/bin/env python3
"""
Generate manabase requirement tables.

Uses London Mulligan (2019+ standard) for 60-card Constructed and 99-card Duel Commander.
"""

import re
from typing import Dict, List, Tuple
from .types import SimulationConfig
from .simulation import find_minimum_sources


def parse_pattern(pattern: str) -> Tuple[int, int, str]:
    """
    Parse mana pattern string into (colored_pips, generic_mana, label).

    Examples:
        "C" -> (1, 0, "C")
        "1C" -> (1, 1, "1C")
        "2CC" -> (2, 2, "2CC")
        "CCC" -> (3, 0, "CCC")
        "1CCC" -> (3, 1, "1CCC")

    Args:
        pattern: Pattern string (e.g., "1C", "2CC", "CCC")

    Returns:
        Tuple of (colored_pips, generic_mana, label)
    """
    # Match pattern: optional digits followed by one or more C's
    match = re.match(r"^(\d*)([C]+)$", pattern.upper())
    if not match:
        raise ValueError(
            f"Invalid pattern: {pattern}. Expected format like C, 1C, 2CC, CCC"
        )

    generic_str, colored_str = match.groups()
    generic_mana = int(generic_str) if generic_str else 0
    colored_pips = len(colored_str)

    return colored_pips, generic_mana, pattern


def generate_table(
    deck_size: int,
    patterns: List[Tuple[int, int, str]] = None,
    max_turn: int = 7,
    iterations: int = 1_000_000,
    land_count: int = None,
) -> Dict[str, Dict[int, int]]:
    """
    Generate a complete table for a deck size.

    Args:
        deck_size: Size of deck (40, 60, or 99)
        patterns: List of (colored_pips, generic_mana, label) tuples
        max_turn: Maximum turn to calculate for
        iterations: Number of simulation iterations
        land_count: Override default land count (optional)

    Returns:
        Nested dict: {pattern_label: {turn: minimum_sources}}
    """
    if patterns is None:
        # Default to C, CC, CCC
        patterns = [(1, 0, "C"), (2, 0, "CC"), (3, 0, "CCC")]

    table = {}

    for colored_pips, generic_mana, label in patterns:
        table[label] = {}
        cmc = colored_pips + generic_mana  # Total mana cost

        for turn in range(1, max_turn + 1):
            # Skip impossible combinations (can't cast spell before its CMC)
            if turn < cmc:
                table[label][turn] = None
                continue

            lands_str = f", {land_count} lands" if land_count else ""
            print(f"\n{deck_size}-card deck{lands_str}, pattern {label}, turn {turn}:")
            print("-" * 60)

            config = SimulationConfig.from_deck_size(
                deck_size=deck_size,
                good_lands_needed=colored_pips,
                turn_allowed=turn,
                iterations=iterations,
                on_play=True,
                land_count=land_count,
            )

            min_sources = find_minimum_sources(config, verbose=True)
            table[label][turn] = min_sources

            print(f"\n✓ Result: {min_sources} sources needed")

    return table


def print_table(deck_size: int, table: Dict[str, Dict[int, int]], max_turn: int = 7):
    """
    Print a formatted table.

    Args:
        deck_size: Size of deck
        table: Table data from generate_table
        max_turn: Maximum turn to display
    """
    print(f"\n{'=' * 70}")
    print(f"RESULTS FOR {deck_size}-CARD DECK")
    print(f"{'=' * 70}\n")

    for pattern_label in table.keys():
        # Parse pattern to get colored pip count for description
        colored_pips, generic_mana, _ = parse_pattern(pattern_label)
        cmc = colored_pips + generic_mana

        print(
            f"\n{pattern_label} (CMC={cmc}, need {colored_pips} colored source{'s' if colored_pips > 1 else ''}):"
        )
        print("-" * 70)

        # Header row
        header = "Turn |"
        for turn in range(1, max_turn + 1):
            header += f" {turn:^6} |"
        print(header)
        print("-" * 70)

        # Data row
        row = "Srcs |"
        for turn in range(1, max_turn + 1):
            value = table[pattern_label].get(turn)
            if value is None:
                row += "   -   |"
            else:
                row += f" {value:^6} |"
        print(row)
        print()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Frank Karsten Manabase Simulation (2013 baseline)"
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Use 1M iterations instead of 100k (slower but more accurate)",
    )
    parser.add_argument(
        "--deck-size",
        type=int,
        choices=[60, 99],
        help="Deck size (60 or 99)",
    )
    parser.add_argument(
        "--land-count",
        type=int,
        help="Number of lands in deck (overrides default for deck size)",
    )
    parser.add_argument(
        "--mana",
        type=int,
        choices=[1, 2, 3],
        help="Only run simulation for specific colored mana (1=C, 2=CC, 3=CCC)",
    )
    parser.add_argument(
        "--patterns",
        type=str,
        help="Comma-separated mana patterns (e.g., C,CC,1C,2C,CCC)",
    )

    args = parser.parse_args()

    print("=" * 70)
    print("Frank Karsten Manabase Simulation")
    print("London Mulligan (2019+)")
    print("60-card Constructed & 99-card Duel Commander")
    print("=" * 70)

    # Configuration
    iterations = 1_000_000 if args.full else 100_000

    if args.full:
        print("\n🔥 Running FULL simulation with 1M iterations per configuration")
        print("⚠️  This will take a while (10-30 minutes)...\n")
    else:
        print(f"\n⚡ Running FAST mode with {iterations:,} iterations")
        print("💡 Use --full flag for 1M iterations (more accurate results)\n")

    # Determine which patterns to test
    if args.patterns:
        # Parse pattern strings (e.g., "C,CC,1C,2C,CCC")
        pattern_strings = [p.strip() for p in args.patterns.split(",")]
        patterns = []

        for pattern in pattern_strings:
            colored_pips, generic_mana, label = parse_pattern(pattern)
            patterns.append((colored_pips, generic_mana, label))

        print(f"📊 Testing patterns: {args.patterns}\n")
    elif args.mana:
        # Convert old-style mana argument to patterns
        patterns = [(args.mana, 0, "C" * args.mana)]
        print(f"📊 Testing only {args.mana}C configurations\n")
    else:
        # Default patterns
        patterns = [(1, 0, "C"), (2, 0, "CC"), (3, 0, "CCC")]

    # Determine deck sizes
    if not args.deck_size:
        raise ValueError("--deck-size is required")
    deck_sizes = [args.deck_size]

    # Generate tables
    for deck_size in deck_sizes:
        lands_info = f" with {args.land_count} lands" if args.land_count else ""
        print(f"\n{'#' * 70}")
        print(f"# GENERATING {deck_size}-CARD DECK TABLE{lands_info}")
        print(f"{'#' * 70}")

        table = generate_table(
            deck_size,
            patterns=patterns,
            iterations=iterations,
            land_count=args.land_count,
        )
        print_table(deck_size, table)

    print(f"\n{'=' * 70}")
    print("COMPLETE!")
    print(f"{'=' * 70}\n")


if __name__ == "__main__":
    main()
