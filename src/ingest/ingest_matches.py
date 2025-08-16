from typing import Dict, List, Any, Optional, Tuple
import json

from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from uuid import uuid4

# Local imports (path manipulation handled by caller script)
from models import (
    Tournament,
    TournamentEntry,
    Player,
    Match,
    MatchResult,
)
from ingest.ingest_players import normalize_player_handle
from ingest.rounds_finder import find_rounds_file, TournamentSearchCriteria


def _pairing_already_present(session: Session, e1_id: str, e2_id: str) -> bool:
    """
    Check if a pairing already exists in either direction.
    """
    exists = (
        session.query(Match)
        .filter(
            or_(
                and_(Match.entry_id == e1_id, Match.opponent_entry_id == e2_id),
                and_(Match.entry_id == e2_id, Match.opponent_entry_id == e1_id),
            )
        )
        .first()
        is not None
    )
    return exists


def _recompute_wld_for_tournament(session: Session, tournament_id: str) -> None:
    """
    Recompute wins/losses/draws per entry from Match rows for the tournament.
    """
    entries = (
        session.query(TournamentEntry)
        .filter(TournamentEntry.tournament_id == tournament_id)
        .all()
    )
    for entry in entries:
        wins = (
            session.query(Match)
            .filter(Match.entry_id == entry.id, Match.result == MatchResult.WIN)
            .count()
        )
        losses = (
            session.query(Match)
            .filter(Match.entry_id == entry.id, Match.result == MatchResult.LOSS)
            .count()
        )
        draws = (
            session.query(Match)
            .filter(Match.entry_id == entry.id, Match.result == MatchResult.DRAW)
            .count()
        )
        entry.wins = wins
        entry.losses = losses
        entry.draws = draws
    session.flush()


def _apply_standings(
    session: Session, tournament_id: str, standings: List[Dict[str, Any]]
) -> int:
    """
    Apply Standings rank to entries where player is present.
    Returns number of ranks updated.
    """
    updated = 0
    for row in standings or []:
        handle = (row.get("Player") or "").strip()
        if not handle:
            continue
        entry = _get_entry_for_player(session, tournament_id, handle)
        if not entry:
            continue
        try:
            rank_val = int(row.get("Rank"))
        except Exception:
            continue
        entry.rank = rank_val
        updated += 1
    session.flush()
    return updated


def process_rounds_for_tournament(
    session: Session,
    tournament: Tournament,
    format_name: str,
    tournament_id: str = None,
) -> Dict[str, int]:
    """
    Load and process the rounds file for a single tournament.
    Returns stats dict.
    """
    stats = {
        "pairings_seen": 0,
        "pairings_created": 0,
        "pairings_skipped_missing_entry": 0,
        "pairings_skipped_existing": 0,
        "matches_rows_inserted": 0,
        "ranks_updated": 0,
        "file_missing": 0,
        "file_ambiguous": 0,
    }

    criteria = TournamentSearchCriteria(
        date=tournament.date,
        format_name=format_name,
        source=tournament.source,
        tournament_name=tournament.name,
        tournament_id=tournament_id,
    )
    rounds_path = find_rounds_file(criteria)
    if not rounds_path:
        stats["file_missing"] += 1
        return stats

    try:
        data = json.loads(rounds_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(
            f"  ⚠️ Failed to read rounds file for '{tournament.name}' on {tournament.date.date()}: {e}"
        )
        stats["file_missing"] += 1
        return stats

    rounds = data.get("Rounds") or []

    for rnd in rounds:
        matches = rnd.get("Matches") or []
        for m in matches:
            stats["pairings_seen"] += 1
            p1 = m.get("Player1")
            p2 = m.get("Player2")
            res = m.get("Result")
            if not p1 or not p2 or not res:
                continue

            e1 = _get_entry_for_player(session, tournament.id, p1)
            e2 = _get_entry_for_player(session, tournament.id, p2)
            if not e1 or not e2:
                stats["pairings_skipped_missing_entry"] += 1
                continue

            if _pairing_already_present(session, e1.id, e2.id):
                stats["pairings_skipped_existing"] += 1
                continue

            w, losses, d = _parse_result(res)
            pair_uuid = str(uuid4())
            mirror = e1.archetype_id == e2.archetype_id

            # P1 perspective
            r1 = _result_for_side(w, losses, d, is_p1=True)
            r2 = _result_for_side(w, losses, d, is_p1=False)

            m1 = Match(
                entry_id=e1.id,
                opponent_entry_id=e2.id,
                result=r1,
                mirror=mirror,
                pair_id=pair_uuid,
            )
            m2 = Match(
                entry_id=e2.id,
                opponent_entry_id=e1.id,
                result=r2,
                mirror=mirror,
                pair_id=pair_uuid,
            )
            session.add(m1)
            session.add(m2)
            stats["pairings_created"] += 1
            stats["matches_rows_inserted"] += 2

    # After inserting matches, recompute W/L/D
    _recompute_wld_for_tournament(session, tournament.id)

    # Apply standings → ranks
    standings = data.get("Standings") or []
    stats["ranks_updated"] = _apply_standings(session, tournament.id, standings)

    return stats


def _parse_result(result_str: str) -> Tuple[int, int, int]:
    """
    Parse a result string like '2-1-0' (wins-losses-draws) from Player1 perspective.
    Returns tuple (p1_wins, p1_losses, draws). Unknown/invalid -> (0,0,0).
    """
    if not result_str or not isinstance(result_str, str):
        return (0, 0, 0)
    parts = result_str.strip().split("-")
    if len(parts) != 3:
        return (0, 0, 0)
    try:
        w = int(parts[0])
        losses = int(parts[1])
        d = int(parts[2])
        return (w, losses, d)
    except Exception:
        return (0, 0, 0)


def _result_for_side(p1_w: int, p1_l: int, d: int, is_p1: bool) -> MatchResult:
    """
    Determine MatchResult enum for one side given overall counts.
    """
    if p1_w > p1_l:
        return MatchResult.WIN if is_p1 else MatchResult.LOSS
    if p1_w < p1_l:
        return MatchResult.LOSS if is_p1 else MatchResult.WIN
    return MatchResult.DRAW


def _get_entry_for_player(
    session: Session, tournament_id: str, handle: str
) -> Optional[TournamentEntry]:
    """
    Find TournamentEntry for a player handle in a tournament.
    """
    norm = normalize_player_handle(handle or "")
    if not norm:
        return None
    player = session.query(Player).filter(Player.normalized_handle == norm).first()
    if not player:
        return None
    return (
        session.query(TournamentEntry)
        .filter(
            TournamentEntry.tournament_id == tournament_id,
            TournamentEntry.player_id == player.id,
        )
        .first()
    )
