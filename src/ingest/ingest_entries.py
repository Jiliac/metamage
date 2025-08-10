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
from models import (
    Tournament,
    TournamentEntry,
    DeckCard,
    Card,
    Player,
    Archetype,
    BoardType,
    TournamentSource,
)
from ingest.ingest_players import normalize_player_handle
from ingest.ingest_archetypes import normalize_archetype_name
from ingest.ingest_cards import normalize_card_name


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


def get_card(session: Session, cache: Dict[str, Card], name: str) -> Optional[Card]:
    norm = normalize_card_name(name)
    if norm in cache:
        return cache[norm]
    c = session.query(Card).filter(Card.name == norm).first()
    if c:
        cache[norm] = c
    return c


def upsert_deck_cards_for_entry(
    session: Session,
    entry: TournamentEntry,
    mainboard: List[Dict[str, Any]],
    sideboard: List[Dict[str, Any]],
    card_cache: Dict[str, Card],
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

    def handle_section(items: List[Dict[str, Any]], board: BoardType):
        nonlocal inserted, skipped, total_expected
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
            dc = DeckCard(entry_id=entry.id, card_id=card.id, count=count, board=board)
            session.add(dc)
            inserted += 1

    handle_section(mainboard, BoardType.MAIN)
    handle_section(sideboard, BoardType.SIDE)

    return inserted, skipped, total_expected


def ingest_entries(session: Session, entries: List[Dict[str, Any]], format_id: str):
    """
    Ingest tournaments, tournament entries, and deck cards based on JSON data.
    - Does not ingest matches.
    - Leaves wins/losses/draws at their default values.
    """
    print("🧾 Processing tournaments, entries and deck cards...")

    t_cache: Dict[str, Tournament] = {}
    p_cache: Dict[str, Player] = {}
    a_cache: Dict[str, Archetype] = {}
    c_cache: Dict[str, Card] = {}

    stats = {
        "entries_seen": 0,
        "tournaments_created": 0,
        "tournaments_existing": 0,
        "entries_created": 0,
        "entries_existing": 0,
        "deck_card_rows_written": 0,
        "deck_cards_missing_cards": 0,
        "skipped_missing_player": 0,
        "skipped_missing_archetype": 0,
    }

    for i, e in enumerate(entries, start=1):
        stats["entries_seen"] += 1

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

        # Entry (unique per tournament + player)
        existing_entry = (
            session.query(TournamentEntry)
            .filter(
                TournamentEntry.tournament_id == tournament.id,
                TournamentEntry.player_id == player.id,
            )
            .first()
        )

        if existing_entry:
            stats["entries_existing"] += 1
            entry = existing_entry
            # Refresh archetype and decklist_url in case they changed
            entry.archetype_id = archetype.id
            entry.decklist_url = anchor
            session.flush()
        else:
            entry = TournamentEntry(
                tournament_id=tournament.id,
                player_id=player.id,
                archetype_id=archetype.id,
                decklist_url=anchor,
            )
            session.add(entry)
            session.flush()
            stats["entries_created"] += 1

        # Deck cards: rebuild
        mb = e.get("Mainboard", [])
        sb = e.get("Sideboard", [])
        inserted, skipped_missing, _ = upsert_deck_cards_for_entry(
            session, entry, mb, sb, c_cache
        )
        stats["deck_card_rows_written"] += inserted
        stats["deck_cards_missing_cards"] += skipped_missing

        if (i % 50) == 0:
            session.flush()
            print(f"  📊 Processed {i}/{len(entries)} entries...")

    print("\n📊 Entries Ingestion Summary:")
    print(f"  🧾 Entries seen: {stats['entries_seen']}")
    print(
        f"  🏟️ Tournaments created: {stats['tournaments_created']}, existing: {stats['tournaments_existing']}"
    )
    print(
        f"  👤 Entries created: {stats['entries_created']}, existing: {stats['entries_existing']}"
    )
    print(f"  🧩 Deck card rows written (rebuilt): {stats['deck_card_rows_written']}")
    print(f"  ⚠️ Deck cards skipped (missing card): {stats['deck_cards_missing_cards']}")
