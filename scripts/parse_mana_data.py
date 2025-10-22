#!/usr/bin/env python3
"""
Parse Frank Karsten mana simulation output files into JSON format
for use in the Next.js UI
"""

import json
import re
from pathlib import Path
from typing import Dict, Any


def parse_mana_file(file_path: Path) -> Dict[str, Any]:
    """Parse a single mana simulation output file"""

    with open(file_path, "r") as f:
        content = f.read()

    # Extract metadata from header
    land_count_match = re.search(r"(\d+)-card deck.*?with (\d+) lands", content)
    if not land_count_match:
        # Try alternative format
        land_count_match = re.search(
            r"GENERATING (\d+)-CARD DECK TABLE with (\d+) lands", content
        )

    if not land_count_match:
        raise ValueError(f"Could not extract deck/land count from {file_path}")

    deck_size = int(land_count_match.group(1))
    land_count = int(land_count_match.group(2))

    # Extract all pattern results
    # Pattern: "99-card deck, 40 lands, pattern C, turn 1:"
    pattern_regex = r"deck, \d+ lands, pattern ([A-Z0-9]+), turn (\d+):"
    result_regex = r"✓ Result: (\d+) sources needed"

    patterns = {}

    # Find all pattern sections
    pattern_matches = list(re.finditer(pattern_regex, content))

    for i, match in enumerate(pattern_matches):
        pattern_name = match.group(1)
        turn = int(match.group(2))

        # Find the next "✓ Result" line after this match
        start_pos = match.end()
        end_pos = (
            pattern_matches[i + 1].start()
            if i + 1 < len(pattern_matches)
            else len(content)
        )

        section = content[start_pos:end_pos]
        result_match = re.search(result_regex, section)

        if result_match:
            sources_needed = int(result_match.group(1))

            if pattern_name not in patterns:
                patterns[pattern_name] = {}

            patterns[pattern_name][turn] = sources_needed

    return {"deck_size": deck_size, "land_count": land_count, "patterns": patterns}


def main():
    # Parse all mana data files
    data_dir = Path(__file__).parent.parent / "data" / "mana"
    output_file = (
        Path(__file__).parent.parent / "ui" / "src" / "data" / "mana-tables.json"
    )

    if not data_dir.exists():
        print(f"Error: {data_dir} does not exist")
        return

    all_data = []

    for file_path in sorted(data_dir.glob("land_*.txt")):
        print(f"Parsing {file_path.name}...")
        try:
            data = parse_mana_file(file_path)
            all_data.append(data)
            print(
                f"  ✓ Deck: {data['deck_size']}, Lands: {data['land_count']}, Patterns: {len(data['patterns'])}"
            )
        except Exception as e:
            print(f"  ✗ Error: {e}")

    # Create output directory if needed
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # Write JSON
    with open(output_file, "w") as f:
        json.dump(all_data, f, indent=2)

    print(f"\n✓ Written {len(all_data)} configurations to {output_file}")
    print(f"  Total size: {output_file.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
