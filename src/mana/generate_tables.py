#!/usr/bin/env python3
"""
Generate manabase requirement tables.

Reproduces Frank Karsten's methodology for different deck sizes.
Run this script to generate tables for 60-card Constructed and 99-card Duel Commander.
"""

from typing import Dict, List
from .types import SimulationConfig
from .simulation import find_minimum_sources


def generate_table(
    deck_size: int,
    colored_mana_counts: List[int] = [1, 2, 3],
    max_turn: int = 7,
    iterations: int = 1_000_000,
) -> Dict[int, Dict[int, int]]:
    """
    Generate a complete table for a deck size.

    Args:
        deck_size: Size of deck (40, 60, or 99)
        colored_mana_counts: List of mana requirements (1=C, 2=CC, 3=CCC)
        max_turn: Maximum turn to calculate for
        iterations: Number of simulation iterations

    Returns:
        Nested dict: {colored_mana: {turn: minimum_sources}}
    """
    table = {}

    for colored_mana in colored_mana_counts:
        table[colored_mana] = {}

        for turn in range(1, max_turn + 1):
            # Skip impossible combinations (can't cast CC on turn 1)
            if turn < colored_mana:
                table[colored_mana][turn] = None
                continue

            print(f"\n{deck_size}-card deck, {colored_mana}C, turn {turn}:")
            print("-" * 60)

            config = SimulationConfig.from_deck_size(
                deck_size=deck_size,
                good_lands_needed=colored_mana,
                turn_allowed=turn,
                iterations=iterations,
                on_play=True,
            )

            min_sources = find_minimum_sources(config, verbose=True)
            table[colored_mana][turn] = min_sources

            print(f"\n✓ Result: {min_sources} sources needed")

    return table


def print_table(deck_size: int, table: Dict[int, Dict[int, int]], max_turn: int = 7):
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

    for colored_mana in sorted(table.keys()):
        mana_str = "C" * colored_mana
        print(
            f"\n{mana_str} (need {colored_mana} colored source{'s' if colored_mana > 1 else ''}):"
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
            value = table[colored_mana][turn]
            if value is None:
                row += "   -   |"
            else:
                row += f" {value:^6} |"
        print(row)
        print()


def compare_to_published(
    deck_size: int,
    table: Dict[int, Dict[int, int]],
    published: Dict[int, Dict[int, int]],
):
    """
    Compare generated table to published 2013 results.

    Args:
        deck_size: Size of deck
        table: Generated table
        published: Published table from 2013 article
    """
    print(f"\n{'=' * 70}")
    print(f"VALIDATION: {deck_size}-CARD DECK vs 2013 PUBLISHED RESULTS")
    print(f"{'=' * 70}\n")

    all_match = True

    for colored_mana in sorted(published.keys()):
        mana_str = "C" * colored_mana
        print(f"{mana_str}:")

        for turn in sorted(published[colored_mana].keys()):
            published_val = published[colored_mana][turn]
            generated_val = table.get(colored_mana, {}).get(turn)

            if published_val is None:
                continue

            match = "✓" if generated_val == published_val else "✗"
            status = "MATCH" if generated_val == published_val else "DIFFER"

            print(
                f"  Turn {turn}: {generated_val:2} vs {published_val:2} {match} {status}"
            )

            if generated_val != published_val:
                all_match = False

    if all_match:
        print("\n✅ All values match 2013 published results!")
    else:
        print("\n⚠️  Some values differ from published results.")
        print("This may be due to random variation or implementation differences.")


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
        help="Only run simulation for specific deck size (60 or 99)",
    )
    parser.add_argument(
        "--mana",
        type=int,
        choices=[1, 2, 3],
        help="Only run simulation for specific colored mana (1=C, 2=CC, 3=CCC)",
    )

    args = parser.parse_args()

    print("=" * 70)
    print("Frank Karsten Manabase Simulation")
    print("Generating tables for 60-card Constructed & 99-card Duel Commander")
    print("=" * 70)

    # Published 2013 results for validation
    # From docs/karsten/TECHNICAL_REPORT.md Appendix A

    PUBLISHED_60 = {
        1: {1: 14, 2: 13, 3: 12, 4: 11, 5: 10, 6: 9, 7: 9},
        2: {1: None, 2: 20, 3: 19, 4: 18, 5: 16, 6: 15, 7: 14},
        3: {1: None, 2: None, 3: 22, 4: 22, 5: 21, 6: 20, 7: 19},
    }

    PUBLISHED_99 = {
        1: {1: 23, 2: 21, 3: 20, 4: 18, 5: 17, 6: 16, 7: 15},
        2: {1: None, 2: 33, 3: 31, 4: 29, 5: 27, 6: 26, 7: 24},
        3: {1: None, 2: None, 3: 37, 4: 36, 5: 34, 6: 33, 7: 32},
    }

    # Configuration
    iterations = 1_000_000 if args.full else 100_000

    if args.full:
        print("\n🔥 Running FULL simulation with 1M iterations per configuration")
        print("⚠️  This will take a while (10-30 minutes)...\n")
    else:
        print(f"\n⚡ Running FAST mode with {iterations:,} iterations")
        print("💡 Use --full flag for 1M iterations (exact 2013 reproduction)\n")

    # Determine which colored mana counts to test
    if args.mana:
        colored_mana_counts = [args.mana]
        print(f"📊 Testing only {args.mana}C configurations\n")
    else:
        colored_mana_counts = [1, 2, 3]

    # Generate tables based on arguments
    deck_sizes = [args.deck_size] if args.deck_size else [60, 99]

    for deck_size in deck_sizes:
        print(f"\n{'#' * 70}")
        print(f"# GENERATING {deck_size}-CARD DECK TABLE")
        print(f"{'#' * 70}")

        table = generate_table(
            deck_size, colored_mana_counts=colored_mana_counts, iterations=iterations
        )
        print_table(deck_size, table)

        # Compare to published results
        published = PUBLISHED_60 if deck_size == 60 else PUBLISHED_99
        compare_to_published(deck_size, table, published)

    print(f"\n{'=' * 70}")
    print("COMPLETE!")
    print(f"{'=' * 70}\n")


if __name__ == "__main__":
    main()
