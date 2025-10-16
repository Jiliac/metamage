"""
Commander archetype extraction module for Duel Commander format.

This module handles extracting commander information from decks and
normalizing commander names into archetypes using configurable mappings.
"""

import sys
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Lazy import to avoid circular dependencies
_yaml = None
_commander_mappings = None


def _import_yaml():
    """Lazy import of yaml module."""
    global _yaml
    if _yaml is None:
        try:
            import yaml

            _yaml = yaml
        except ImportError:
            print("⚠️  PyYAML not installed. Run: pip install pyyaml")
            sys.exit(1)
    return _yaml


def load_commander_mappings() -> Dict[str, Any]:
    """
    Load commander archetype mappings from YAML configuration file.

    Returns:
        dict: Configuration containing 'partner_groupings' and 'name_mappings'
    """
    global _commander_mappings

    # Return cached mappings if already loaded
    if _commander_mappings is not None:
        return _commander_mappings

    yaml = _import_yaml()
    config_path = (
        Path(__file__).parent.parent.parent / "data" / "commander_archetypes.yaml"
    )

    if not config_path.exists():
        print(f"⚠️  Commander mappings file not found: {config_path}")
        # Return empty mappings as fallback
        _commander_mappings = {"partner_groupings": [], "name_mappings": {}}
        return _commander_mappings

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
            _commander_mappings = {
                "partner_groupings": config.get("partner_groupings", []),
                "name_mappings": config.get("name_mappings", {}),
            }
            return _commander_mappings
    except Exception as e:
        print(f"⚠️  Error loading commander mappings: {e}")
        _commander_mappings = {"partner_groupings": [], "name_mappings": {}}
        return _commander_mappings


def extract_commander_from_deck(deck: Dict[str, Any]) -> Optional[str]:
    """
    Extract the commander name from a deck dictionary.

    In Duel Commander, the commander is in the Sideboard:
    - Single commander: 1 card in sideboard
    - Partner commanders: 2 cards in sideboard (combined as "Card1 // Card2")

    Args:
        deck: Deck dictionary containing 'Sideboard' key

    Returns:
        str: Commander name (or partner combination), or None if not found
    """
    if "Sideboard" not in deck:
        return None

    sideboard = deck["Sideboard"]
    if not isinstance(sideboard, list) or len(sideboard) == 0:
        return None

    # Extract all commander card names from sideboard
    commander_names = []
    for commander_entry in sideboard:
        if not isinstance(commander_entry, dict):
            continue
        card_name = commander_entry.get("CardName", "").strip()
        if card_name:
            commander_names.append(card_name)

    if len(commander_names) == 0:
        return None
    elif len(commander_names) == 1:
        # Single commander
        return commander_names[0]
    else:
        # Partner commanders - combine as "Card1 // Card2" (alphabetically sorted)
        # Sort to ensure consistent naming regardless of card order in JSON
        commander_names.sort()
        return " // ".join(commander_names)


def _check_partner_grouping(
    commander_name: str, mappings: Dict[str, Any]
) -> Optional[str]:
    """
    Check if a commander belongs to a partner grouping.

    Args:
        commander_name: Full commander name
        mappings: Configuration dictionary

    Returns:
        str: Grouped archetype name if found, None otherwise
    """
    partner_groupings = mappings.get("partner_groupings", [])

    for group in partner_groupings:
        commanders = group.get("commanders", [])
        if commander_name in commanders:
            return group.get("archetype_name")

    return None


def normalize_commander_name(commander_name: str, mappings: Dict[str, Any]) -> str:
    """
    Normalize a commander name into an archetype name.

    Process:
    1. Check if commander belongs to a partner grouping
    2. Check if commander has a name shortening mapping
    3. Default: use full commander name

    Args:
        commander_name: Full commander name
        mappings: Configuration dictionary

    Returns:
        str: Normalized archetype name
    """
    if not commander_name:
        return "Unknown"

    # Step 1: Check partner groupings first (takes precedence)
    grouped_name = _check_partner_grouping(commander_name, mappings)
    if grouped_name:
        return grouped_name

    # Step 2: Check name shortening mappings
    name_mappings = mappings.get("name_mappings", {})
    if commander_name in name_mappings:
        return name_mappings[commander_name]

    # Step 3: Default to full commander name
    return commander_name


def get_commander_archetype(
    deck: Dict[str, Any],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Get the archetype name and color for a Duel Commander deck.

    Args:
        deck: Deck dictionary

    Returns:
        tuple: (archetype_name, color) where color is extracted if available
               Returns (None, None) if commander cannot be extracted
    """
    # Extract commander from deck
    commander_name = extract_commander_from_deck(deck)
    if not commander_name:
        return None, None

    # Load mappings
    mappings = load_commander_mappings()

    # Normalize commander name to archetype
    archetype_name = normalize_commander_name(commander_name, mappings)

    # Extract color from deck if available (Archetype.Color field)
    # For now, we'll return None for color and let it be inferred later from card data
    color = None
    if "Archetype" in deck and isinstance(deck["Archetype"], dict):
        color = deck["Archetype"].get("Color", "").strip() or None

    return archetype_name, color


def extract_archetype_data(
    entry: Dict[str, Any],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract archetype information from a tournament entry (deck).

    This is a compatibility function that matches the signature of
    ingest_archetypes.extract_archetype_data() for non-Commander formats.

    Args:
        entry: Tournament entry/deck dictionary

    Returns:
        tuple: (archetype_name, color) or (None, None) if invalid
    """
    return get_commander_archetype(entry)
