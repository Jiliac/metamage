#!/usr/bin/env python3
"""
Create a new database containing only tournaments from October 1st, 2025 onwards.

This script:
- Copies all formats
- Copies all cards and related data (sets, card_colors)
- Filters tournaments to only those from Oct 1, 2025 onwards
- Copies only relevant players, archetypes, entries, deck_cards, and matches
- Copies relevant meta_changes
"""

import sys
from pathlib import Path
from datetime import datetime

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from models import (
    Base,
    Format,
    Set,
    Card,
    CardColor,
    Tournament,
    TournamentEntry,
    Player,
    Archetype,
    DeckCard,
    Match,
    MetaChange,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def create_filtered_database(
    source_db_path: str,
    target_db_path: str,
    cutoff_date: datetime,
):
    """Create a new database with filtered tournament data."""

    print("=" * 70)
    print("Creating Filtered Database from Oct 1, 2025")
    print("=" * 70)

    # Create target database path
    target_path = Path(target_db_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    # Remove target if it exists
    if target_path.exists():
        print(f"\nRemoving existing target database: {target_db_path}")
        target_path.unlink()

    # Create engines
    source_engine = create_engine(f"sqlite:///{source_db_path}")
    target_engine = create_engine(f"sqlite:///{target_db_path}")

    # Create schema in target
    print("\nCreating schema in target database...")
    Base.metadata.create_all(target_engine)

    # Create sessions
    SourceSession = sessionmaker(bind=source_engine)
    TargetSession = sessionmaker(bind=target_engine)

    source_session = SourceSession()
    target_session = TargetSession()

    try:
        # Track mappings from old IDs to new objects
        format_map = {}
        set_map = {}
        card_map = {}
        player_map = {}
        archetype_map = {}
        tournament_map = {}
        entry_map = {}

        # 1. Copy all formats
        print("\nCopying formats...")
        formats = source_session.query(Format).all()
        for fmt in formats:
            new_format = Format(
                id=fmt.id,
                name=fmt.name,
                created_at=fmt.created_at,
                updated_at=fmt.updated_at,
            )
            target_session.add(new_format)
            format_map[fmt.id] = new_format
        target_session.flush()
        print(f"  Copied {len(formats)} formats")

        # 2. Copy all sets
        print("\nCopying sets...")
        sets = source_session.query(Set).all()
        for s in sets:
            new_set = Set(
                id=s.id,
                code=s.code,
                name=s.name,
                set_type=s.set_type,
                released_at=s.released_at,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            target_session.add(new_set)
            set_map[s.id] = new_set
        target_session.flush()
        print(f"  Copied {len(sets)} sets")

        # 3. Copy all cards
        print("\nCopying cards...")
        cards = source_session.query(Card).all()
        for card in cards:
            new_card = Card(
                id=card.id,
                name=card.name,
                scryfall_oracle_id=card.scryfall_oracle_id,
                is_land=card.is_land,
                colors=card.colors,
                first_printed_set_id=card.first_printed_set_id,
                first_printed_date=card.first_printed_date,
                created_at=card.created_at,
                updated_at=card.updated_at,
            )
            target_session.add(new_card)
            card_map[card.id] = new_card
        target_session.flush()
        print(f"  Copied {len(cards)} cards")

        # 4. Copy all card_colors
        print("\nCopying card colors...")
        card_colors = source_session.query(CardColor).all()
        for cc in card_colors:
            new_cc = CardColor(
                id=cc.id,
                card_id=cc.card_id,
                color=cc.color,
                created_at=cc.created_at,
                updated_at=cc.updated_at,
            )
            target_session.add(new_cc)
        target_session.flush()
        print(f"  Copied {len(card_colors)} card colors")

        # 5. Filter and copy tournaments (Oct 1, 2025 onwards)
        print(
            f"\nFiltering tournaments from {cutoff_date.strftime('%Y-%m-%d')} onwards..."
        )
        tournaments = (
            source_session.query(Tournament)
            .filter(Tournament.date >= cutoff_date)
            .all()
        )
        print(f"  Found {len(tournaments)} tournaments")

        for tournament in tournaments:
            new_tournament = Tournament(
                id=tournament.id,
                name=tournament.name,
                date=tournament.date,
                format_id=tournament.format_id,
                source=tournament.source,
                link=tournament.link,
                created_at=tournament.created_at,
                updated_at=tournament.updated_at,
            )
            target_session.add(new_tournament)
            tournament_map[tournament.id] = new_tournament
        target_session.flush()
        print(f"  Copied {len(tournaments)} tournaments")

        # 6. Get all entries for these tournaments and copy relevant players/archetypes
        print("\nCopying tournament entries and related data...")
        entries = (
            source_session.query(TournamentEntry)
            .filter(TournamentEntry.tournament_id.in_(tournament_map.keys()))
            .all()
        )
        print(f"  Found {len(entries)} entries")

        # Collect unique players and archetypes
        player_ids = {entry.player_id for entry in entries}
        archetype_ids = {entry.archetype_id for entry in entries}

        # Copy players
        print("\nCopying players...")
        players = source_session.query(Player).filter(Player.id.in_(player_ids)).all()
        for player in players:
            new_player = Player(
                id=player.id,
                handle=player.handle,
                normalized_handle=player.normalized_handle,
                created_at=player.created_at,
                updated_at=player.updated_at,
            )
            target_session.add(new_player)
            player_map[player.id] = new_player
        target_session.flush()
        print(f"  Copied {len(players)} players")

        # Copy archetypes
        print("\nCopying archetypes...")
        archetypes = (
            source_session.query(Archetype)
            .filter(Archetype.id.in_(archetype_ids))
            .all()
        )
        for archetype in archetypes:
            new_archetype = Archetype(
                id=archetype.id,
                format_id=archetype.format_id,
                name=archetype.name,
                color=archetype.color,
                created_at=archetype.created_at,
                updated_at=archetype.updated_at,
            )
            target_session.add(new_archetype)
            archetype_map[archetype.id] = new_archetype
        target_session.flush()
        print(f"  Copied {len(archetypes)} archetypes")

        # Copy entries
        print("\nCopying tournament entries...")
        for entry in entries:
            new_entry = TournamentEntry(
                id=entry.id,
                tournament_id=entry.tournament_id,
                player_id=entry.player_id,
                archetype_id=entry.archetype_id,
                wins=entry.wins,
                losses=entry.losses,
                draws=entry.draws,
                rank=entry.rank,
                decklist_url=entry.decklist_url,
                created_at=entry.created_at,
                updated_at=entry.updated_at,
            )
            target_session.add(new_entry)
            entry_map[entry.id] = new_entry
        target_session.flush()
        print(f"  Copied {len(entries)} entries")

        # 7. Copy deck_cards for these entries
        print("\nCopying deck cards...")
        deck_cards = (
            source_session.query(DeckCard)
            .filter(DeckCard.entry_id.in_(entry_map.keys()))
            .all()
        )
        for dc in deck_cards:
            new_dc = DeckCard(
                id=dc.id,
                entry_id=dc.entry_id,
                card_id=dc.card_id,
                count=dc.count,
                board=dc.board,
                created_at=dc.created_at,
                updated_at=dc.updated_at,
            )
            target_session.add(new_dc)
        target_session.flush()
        print(f"  Copied {len(deck_cards)} deck cards")

        # 8. Copy matches for these entries
        print("\nCopying matches...")
        matches = (
            source_session.query(Match)
            .filter(Match.entry_id.in_(entry_map.keys()))
            .all()
        )
        for match in matches:
            # Only copy if both entries are in our filtered set
            if match.opponent_entry_id in entry_map:
                new_match = Match(
                    id=match.id,
                    entry_id=match.entry_id,
                    opponent_entry_id=match.opponent_entry_id,
                    result=match.result,
                    mirror=match.mirror,
                    pair_id=match.pair_id,
                    created_at=match.created_at,
                    updated_at=match.updated_at,
                )
                target_session.add(new_match)
        target_session.flush()
        print("  Copied matches (filtered for valid entries)")

        # 9. Copy meta_changes (only up to cutoff date or all?)
        # Let's copy all meta_changes as they provide context
        print("\nCopying meta changes...")
        meta_changes = source_session.query(MetaChange).all()
        for mc in meta_changes:
            new_mc = MetaChange(
                id=mc.id,
                format_id=mc.format_id,
                date=mc.date,
                change_type=mc.change_type,
                description=mc.description,
                set_code=mc.set_code,
                created_at=mc.created_at,
                updated_at=mc.updated_at,
            )
            target_session.add(new_mc)
        target_session.flush()
        print(f"  Copied {len(meta_changes)} meta changes")

        # Commit everything
        print("\nCommitting changes...")
        target_session.commit()

        # Print summary
        print("\n" + "=" * 70)
        print("Summary")
        print("=" * 70)
        print(f"Source database: {source_db_path}")
        print(f"Target database: {target_db_path}")
        print(f"Cutoff date: {cutoff_date.strftime('%Y-%m-%d')}")
        print("\nCopied:")
        print(f"  Formats:     {len(formats)}")
        print(f"  Sets:        {len(sets)}")
        print(f"  Cards:       {len(cards)}")
        print(f"  CardColors:  {len(card_colors)}")
        print(f"  Tournaments: {len(tournaments)}")
        print(f"  Players:     {len(players)}")
        print(f"  Archetypes:  {len(archetypes)}")
        print(f"  Entries:     {len(entries)}")
        print(f"  DeckCards:   {len(deck_cards)}")
        print("  Matches:     (filtered)")
        print(f"  MetaChanges: {len(meta_changes)}")
        print("=" * 70)

        # Get statistics from new database
        print("\nVerifying target database...")
        verify_stats = {
            "tournaments": target_session.query(Tournament).count(),
            "entries": target_session.query(TournamentEntry).count(),
            "players": target_session.query(Player).count(),
            "cards": target_session.query(Card).count(),
            "archetypes": target_session.query(Archetype).count(),
        }

        print("\nTarget database statistics:")
        for key, value in verify_stats.items():
            print(f"  {key.capitalize()}: {value:,}")

        print("\n" + "=" * 70)
        print("Database creation complete!")
        print("=" * 70)

    except Exception as e:
        print(f"\nError: {e}")
        target_session.rollback()
        raise
    finally:
        source_session.close()
        target_session.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Create a filtered database with tournaments from Oct 1, 2025 onwards"
    )
    parser.add_argument(
        "--source",
        default="data/tournament.db",
        help="Source database path (default: data/tournament.db)",
    )
    parser.add_argument(
        "--target",
        default="data/tournament_oct2025.db",
        help="Target database path (default: data/tournament_oct2025.db)",
    )
    parser.add_argument(
        "--date",
        default="2025-10-01",
        help="Cutoff date (YYYY-MM-DD, default: 2025-10-01)",
    )

    args = parser.parse_args()

    # Parse cutoff date
    cutoff_date = datetime.strptime(args.date, "%Y-%m-%d")

    create_filtered_database(args.source, args.target, cutoff_date)
