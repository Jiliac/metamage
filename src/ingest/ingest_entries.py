"""
Tournament + entries + deck cards ingestion.

Parses JSON entries with fields like:
- Tournament (name), Date, AnchorUri, Player, Archetype{Archetype, Color, Companion}
- Mainboard/Sideboard [{Count, CardName}]
Creates/links:
- tournaments
- tournament_entries (wins/losses/draws left at defaults)
- deck_cards
"""

from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session

# Local imports (path manipulation handled by caller script)
from ingest.ingest_matches import process_rounds_for_tournament
from models import (
    Tournament,
    TournamentEntry,
    DeckCard,
    Card,
    Player,
    Archetype,
    Format,
    BoardType,
    TournamentSource,
)
from ingest.ingest_players import normalize_player_handle
from ingest.ingest_archetypes import normalize_archetype_name
from ingest.ingest_cards import normalize_card_name, CardCache, fetch_scryfall_data
from ingest.rounds_finder import find_rounds_file


def parse_iso_datetime(dt_str: str) -> datetime:
    """Parse ISO 8601 datetime string without timezone."""
    return datetime.fromisoformat(dt_str)


def detect_source(anchor_uri: Optional[str]) -> TournamentSource:
    """Infer tournament source from URL."""
    if not anchor_uri:
        return TournamentSource.OTHER
    lowered = anchor_uri.lower()
    if "mtgo.com" in lowered:
        return TournamentSource.MTGO
    if "melee" in lowered or "mtgmelee" in lowered:
        return TournamentSource.MELEE
    return TournamentSource.OTHER


def clean_mtgo_url(url: Optional[str]) -> Optional[str]:
    """Remove fragment (hash) from mtgo.com URLs."""
    if not url:
        return url
    if "mtgo.com" in url.lower() and "#" in url:
        return url.split("#")[0]
    return url


def get_or_create_tournament(
    session: Session,
    cache: Dict[str, Tournament],
    name: str,
    date: datetime,
    format_id: str,
    link: Optional[str],
    source: TournamentSource,
) -> Tuple[Tournament, bool]:
    """
    Returns: (tournament, created)
    created=True if a new Tournament was inserted this run.
    """
    key = f"{name}|{date.isoformat()}|{format_id}"
    if key in cache:
        return cache[key], False

    existing = (
        session.query(Tournament)
        .filter(
            Tournament.name == name,
            Tournament.date == date,
            Tournament.format_id == format_id,
        )
        .first()
    )
    if existing:
        cache[key] = existing
        return existing, False

    t = Tournament(
        name=name,
        date=date,
        format_id=format_id,
        source=source,
        link=clean_mtgo_url(link),
    )
    session.add(t)
    session.flush()
    cache[key] = t
    return t, True


def get_player(
    session: Session, cache: Dict[str, Player], handle: str
) -> Optional[Player]:
    norm = normalize_player_handle(handle)
    if norm in cache:
        return cache[norm]
    p = session.query(Player).filter(Player.normalized_handle == norm).first()
    if p:
        cache[norm] = p
    return p


def get_archetype(
    session: Session, cache: Dict[str, Archetype], format_id: str, name: str
) -> Optional[Archetype]:
    norm = normalize_archetype_name(name)
    key = f"{format_id}|{norm}"
    if key in cache:
        return cache[key]
    a = (
        session.query(Archetype)
        .filter(Archetype.format_id == format_id, Archetype.name == norm)
        .first()
    )
    if a:
        cache[key] = a
    return a


def get_card(session: Session, card_cache: CardCache, name: str) -> Optional[Card]:
    """
    Get card from database using Scryfall-powered lookup.
    First checks simple name match, then uses Scryfall API if needed.
    """
    norm = normalize_card_name(name)

    # 1) Check CardCache (from ingest_cards.py logic)
    card = card_cache.get(norm)
    if card:
        return card

    # 2) Check database by stored (canonical) name
    card = session.query(Card).filter(Card.name == norm).first()
    if card:
        card_cache.add(norm, card)
        return card

    # 3) Resolve via Scryfall, then lookup by oracle_id
    scryfall_data = fetch_scryfall_data(name, card_cache)
    if not scryfall_data:
        print(f"  ⚠️ Card not found in DB and Scryfall lookup failed: {name}")
        return None

    oracle_id = scryfall_data.get("oracle_id")
    if not oracle_id:
        print(f"  ⚠️ Missing oracle_id from Scryfall for: {name}")
        return None

    # Try to find existing card by oracle_id
    existing = session.query(Card).filter(Card.scryfall_oracle_id == oracle_id).first()
    if existing:
        card_cache.add(norm, existing)
        return existing

    print(f"  ⚠️ Card not found in DB (skipping): {name}")
    return None


def upsert_entry(
    session: Session,
    tournament_id: str,
    player_id: str,
    archetype_id: str,
    decklist_url: Optional[str],
) -> Tuple[TournamentEntry, bool, bool]:
    """
    Ensure a TournamentEntry exists for (tournament_id, player_id).
    If it exists, update archetype/decklist when changed.

    Returns:
        (entry, created, archetype_changed)
    """
    entry = (
        session.query(TournamentEntry)
        .filter(
            TournamentEntry.tournament_id == tournament_id,
            TournamentEntry.player_id == player_id,
        )
        .first()
    )
    if entry:
        archetype_changed = entry.archetype_id != archetype_id
        decklist_changed = entry.decklist_url != decklist_url
        if archetype_changed or decklist_changed:
            entry.archetype_id = archetype_id
            entry.decklist_url = decklist_url
            session.flush()
        return entry, False, archetype_changed

    entry = TournamentEntry(
        tournament_id=tournament_id,
        player_id=player_id,
        archetype_id=archetype_id,
        decklist_url=decklist_url,
    )
    session.add(entry)
    session.flush()
    return entry, True, False


def upsert_deck_cards_for_entry(
    session: Session,
    entry: TournamentEntry,
    mainboard: List[Dict[str, Any]],
    sideboard: List[Dict[str, Any]],
    card_cache: CardCache,
) -> Tuple[int, int, int]:
    """
    Create deck_cards for the entry from mainboard/sideboard lists if none exist yet.
    If deck_cards already exist for the entry, skip and return (0, 0, 0).
    Returns tuple: (inserted, skipped_missing_cards, total_expected)
    """
    inserted = 0
    skipped = 0
    total_expected = 0

    # If this entry already has deck cards, skip rebuilding to keep ingest idempotent
    existing_count = (
        session.query(DeckCard).filter(DeckCard.entry_id == entry.id).count()
    )
    if existing_count > 0:
        return 0, 0, 0

    # Aggregate cards by (card_id, board) to handle duplicates
    card_aggregates = {}  # key: (card_id, board), value: total_count

    def handle_section(items: List[Dict[str, Any]], board: BoardType):
        nonlocal skipped, total_expected
        if not isinstance(items, list):
            return
        for itm in items:
            if not isinstance(itm, dict):
                continue
            count = itm.get("Count")
            name = itm.get("CardName")
            if not name or not isinstance(count, int):
                # Some JSON have numeric counts as numbers; if strings, try to coerce
                try:
                    count = int(count)
                except Exception:
                    continue
            total_expected += 1
            card = get_card(session, card_cache, name)
            if not card:
                print(f"  ⚠️ Card not found in DB (skipping): {name}")
                skipped += 1
                continue

            # Aggregate duplicate cards
            key = (card.id, board)
            if key in card_aggregates:
                card_aggregates[key] += count
            else:
                card_aggregates[key] = count

    handle_section(mainboard, BoardType.MAIN)
    handle_section(sideboard, BoardType.SIDE)

    # Insert aggregated cards
    for (card_id, board), total_count in card_aggregates.items():
        dc = DeckCard(
            entry_id=entry.id, card_id=card_id, count=total_count, board=board
        )
        session.add(dc)
        inserted += 1

    return inserted, skipped, total_expected


def ingest_entries(session: Session, entries: List[Dict[str, Any]], format_id: str):
    """
    Ingest tournaments, tournament entries, and deck cards based on JSON data.
    - Does not ingest matches.
    - Leaves wins/losses/draws at their default values.
    """
    print("🧾 Processing tournaments, entries, deck cards and matches...")

    t_cache: Dict[str, Tournament] = {}
    p_cache: Dict[str, Player] = {}
    a_cache: Dict[str, Archetype] = {}
    card_cache = CardCache()  # For Scryfall-powered lookups

    stats = {
        "entries_seen": 0,
        "entries_filtered": 0,
        "tournaments_created": 0,
        "tournaments_existing": 0,
        "entries_created": 0,
        "entries_existing": 0,
        "entries_updated_archetype": 0,
        "deck_card_rows_written": 0,
        "deck_cards_missing_cards": 0,
        "skipped_missing_player": 0,
        "skipped_missing_archetype": 0,
        "tournaments_missing_rounds": 0,
        "pairings_seen": 0,
        "pairings_created": 0,
        "pairings_skipped_missing_entry": 0,
        "pairings_skipped_existing": 0,
        "matches_rows_inserted": 0,
        "ranks_updated": 0,
    }

    # Resolve format name for file matching
    format_obj = session.query(Format).filter(Format.id == format_id).first()
    if not format_obj:
        raise ValueError(f"Format id not found: {format_id}")
    format_name = str(format_obj.name).strip().lower()

    # Pre-load existing tournaments for this format to enable filtering
    print("🔍 Pre-loading existing tournaments for filtering...")
    existing_tournaments = (
        session.query(Tournament).filter(Tournament.format_id == format_id).all()
    )
    existing_tournament_keys = {
        f"{t.name}|{t.date.isoformat()}|{format_id}" for t in existing_tournaments
    }
    for t in existing_tournaments:
        cache_key = f"{t.name}|{t.date.isoformat()}|{format_id}"
        t_cache[cache_key] = t
    print(f"  📊 Found {len(existing_tournaments)} existing tournaments")

    # Pre-processing: do not skip entries from tournaments already in DB anymore
    filtered_entries = entries

    print(
        f"  🚮 Filtered out {stats['entries_filtered']} entries during pre-processing"
    )
    print(f"  📝 Processing {len(filtered_entries)} new entries")

    # Track tournaments we touched to finalize matches/standings after entries
    touched_tournaments: Dict[str, Tournament] = {}

    # Track tournaments already warned about missing rounds files
    warned_missing_rounds: set = set()

    # Track multiple rounds files warnings
    warned_multiple_rounds: set = set()

    for i, e in enumerate(filtered_entries, start=1):
        stats["entries_seen"] += 1

        # Testing guard: only process specific tournament file
        # tournament_file = e.get("TournamentFile", "")
        # if tournament_file != "modern-challenge-32-2025-08-0412806330":
        #     continue

        t_name = e.get("Tournament")
        date_str = e.get("Date")
        anchor = e.get("AnchorUri")
        player_handle = e.get("Player")
        arch_obj = e.get("Archetype") or {}

        if not t_name or not date_str or not player_handle or not arch_obj:
            print(f"  ⚠️ Missing required fields in entry #{i}; skipping")
            continue

        try:
            t_date = parse_iso_datetime(date_str)
        except Exception:
            print(f"  ⚠️ Invalid date '{date_str}' in entry #{i}; skipping")
            continue

        # Tournament
        source = detect_source(anchor)
        # 1) Check cache/DB for existing tournament
        cache_key = f"{t_name}|{t_date.isoformat()}|{format_id}"
        tournament = t_cache.get(cache_key)
        is_new_tournament = False
        if not tournament:
            tournament = (
                session.query(Tournament)
                .filter(
                    Tournament.name == t_name,
                    Tournament.date == t_date,
                    Tournament.format_id == format_id,
                )
                .first()
            )
            if tournament:
                t_cache[cache_key] = tournament
            else:
                # 2) Only create if rounds file can be located
                rounds_path = find_rounds_file(
                    t_date, format_name, source, warned_multiple_rounds, t_name
                )
                if not rounds_path:
                    # Only warn once per tournament and only for dates after Nov 1, 2024
                    warn_key = f"{t_name}|{t_date.date()}"
                    nov_1_2024 = datetime(2024, 11, 1).date()
                    if (
                        warn_key not in warned_missing_rounds
                        and t_date.date() > nov_1_2024
                    ):
                        # Add tournament entry details for debugging
                        tournament_file = e.get("TournamentFile", "unknown")
                        entry_player = e.get("Player", "unknown")

                        print(
                            f"  ⚠️ Rounds file NOT found for tournament '{t_name}' on {t_date.date()} [{source.name}] (format '{format_name}') | Entry: player='{entry_player}' file='{tournament_file}'; skipping entry"
                        )
                        warned_missing_rounds.add(warn_key)
                    stats["tournaments_missing_rounds"] += 1
                    continue
                tournament, is_new_tournament = get_or_create_tournament(
                    session=session,
                    cache=t_cache,
                    name=t_name,
                    date=t_date,
                    format_id=format_id,
                    link=anchor,
                    source=source,
                )
        if is_new_tournament:
            stats["tournaments_created"] += 1
        else:
            stats["tournaments_existing"] += 1

        # Mark tournament for matches/standings finalization
        touched_tournaments[tournament.id] = tournament

        # Player
        player = get_player(session, p_cache, player_handle)
        if not player:
            print(
                f"  ⚠️ Player not found (did you ingest players first?): {player_handle}"
            )
            stats["skipped_missing_player"] += 1
            continue

        # Archetype
        arch_name = arch_obj.get("Archetype")
        if not arch_name:
            print(f"  ⚠️ Missing archetype name in entry #{i}; skipping")
            stats["skipped_missing_archetype"] += 1
            continue

        archetype = get_archetype(session, a_cache, format_id, arch_name)
        if not archetype:
            print(
                f"  ⚠️ Archetype not found (did you ingest archetypes first?): {arch_name}"
            )
            stats["skipped_missing_archetype"] += 1
            continue

        # Entry (unique per tournament + player) - upsert and update if archetype changed
        entry, created, archetype_changed = upsert_entry(
            session=session,
            tournament_id=tournament.id,
            player_id=player.id,
            archetype_id=archetype.id,
            decklist_url=anchor,
        )
        if created:
            stats["entries_created"] += 1
        else:
            stats["entries_existing"] += 1
            if archetype_changed:
                stats["entries_updated_archetype"] = (
                    stats.get("entries_updated_archetype", 0) + 1
                )

        # Deck cards: rebuild
        mb = e.get("Mainboard", [])
        sb = e.get("Sideboard", [])
        inserted, skipped_missing, _ = upsert_deck_cards_for_entry(
            session, entry, mb, sb, card_cache
        )
        stats["deck_card_rows_written"] += inserted
        stats["deck_cards_missing_cards"] += skipped_missing

        if (i % 500) == 0:
            session.flush()
            print(f"  📊 Processed {i}/{len(filtered_entries)} entries...")

    # After processing all entries, finalize matches + standings per tournament
    for t in touched_tournaments.values():
        mstats = process_rounds_for_tournament(session, t, format_name)
        stats["pairings_seen"] += mstats["pairings_seen"]
        stats["pairings_created"] += mstats["pairings_created"]
        stats["pairings_skipped_missing_entry"] += mstats[
            "pairings_skipped_missing_entry"
        ]
        stats["pairings_skipped_existing"] += mstats["pairings_skipped_existing"]
        stats["matches_rows_inserted"] += mstats["matches_rows_inserted"]
        stats["ranks_updated"] += mstats["ranks_updated"]
        stats["tournaments_missing_rounds"] += mstats.get(
            "file_missing", 0
        ) + mstats.get("file_ambiguous", 0)

    print("\n📊 Entries Ingestion Summary:")
    print(f"  🧾 Entries seen: {stats['entries_seen']}")
    print(f"  🚮 Entries filtered (existing tournaments): {stats['entries_filtered']}")
    print(
        f"  🏟️ Tournaments created: {stats['tournaments_created']}, existing: {stats['tournaments_existing']}"
    )
    print(
        f"  📁 Tournaments skipped (no rounds file found): {stats['tournaments_missing_rounds']}"
    )
    print(
        f"  👤 Entries created: {stats['entries_created']}, existing: {stats['entries_existing']}"
    )
    print(
        f"  🔄 Entries updated (archetype changed): {stats['entries_updated_archetype']}"
    )
    print(f"  ⚔️ Pairings seen: {stats['pairings_seen']}")
    print(f"  ➕ Pairings created: {stats['pairings_created']}")
    print(f"  🔁 Pairings skipped (existing): {stats['pairings_skipped_existing']}")
    print(
        f"  ⚠️ Pairings skipped (missing entry): {stats['pairings_skipped_missing_entry']}"
    )
    print(f"  🧾 Match rows inserted: {stats['matches_rows_inserted']}")
    print(f"  🏁 Ranks updated: {stats['ranks_updated']}")
    print(f"  🧩 Deck card rows written (rebuilt): {stats['deck_card_rows_written']}")
    print(f"  ⚠️ Deck cards skipped (missing card): {stats['deck_cards_missing_cards']}")
