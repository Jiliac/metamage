"""
Rounds file locator.

Given a tournament date, format name, and source (MTGO/MELEE),
attempt to locate the corresponding "rounds" JSON file on disk,
using data/config_tournament.json to find the base folders.

Folder layout example (MTGO):
<base>/<YYYY>/<MM>/<DD>/<format-slug>-<...>.json

Notes:
- We currently match only by date folder and format slug prefix.
- If multiple candidate files match for the same date and format,
  we return None (ambiguous) and let the caller decide next steps.
- Source OTHER is not supported and returns None.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Set

from models import TournamentSource


@dataclass
class TournamentSearchCriteria:
    """Criteria for searching tournament rounds files."""

    date: datetime
    format_name: str
    source: TournamentSource
    tournament_name: Optional[str] = None
    tournament_id: Optional[str] = None
    expected_winner: Optional[str] = None
    warned_multiple: Optional[Set[str]] = None


CONFIG_PATH = Path("data/config_tournament.json")


@dataclass
class SourceConfig:
    source: TournamentSource
    data_folder: Path


def _load_rounds_config() -> List[SourceConfig]:
    """Load and parse the rounds data configuration."""
    import json

    if not CONFIG_PATH.exists():
        print(f"  ⚠️ Rounds config not found: {CONFIG_PATH}")
        return []

    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  ⚠️ Failed to parse rounds config: {e}")
        return []

    out: List[SourceConfig] = []
    for item in raw:
        try:
            src = item.get("source", "").upper()
            folder = item.get("data_folder")
            if not src or not folder:
                continue
            if src not in TournamentSource.__members__:
                continue
            out.append(
                SourceConfig(source=TournamentSource[src], data_folder=Path(folder))
            )
        except Exception:
            continue
    return out


def _get_base_folder_for_source(source: TournamentSource) -> Optional[Path]:
    """Return the base folder for a given source, if configured."""
    configs = _load_rounds_config()
    for cfg in configs:
        if cfg.source == source:
            return cfg.data_folder
    return None


def _format_slug(format_name: str) -> str:
    """Create a simple slug for format names (lowercase, spaces -> hyphens)."""
    return "-".join(format_name.strip().lower().split())


def _check_tournament_match(
    file_path: Path,
    expected_format: str,
    expected_tournament_name: str = None,
    expected_tournament_id: str = None,
    expected_winner: str = None,
) -> bool:
    """
    Read a JSON file and check if it matches the expected tournament criteria.

    Args:
        file_path: Path to the JSON file
        expected_format: Expected format name (e.g., 'pauper', 'modern')
        expected_tournament_name: Expected tournament name for exact matching
        expected_tournament_id: Expected tournament ID for disambiguation
        expected_winner: Expected 1st place player name for disambiguation

    Returns:
        True if the file matches the criteria
    """
    try:
        import json

        data = json.loads(file_path.read_text(encoding="utf-8"))

        # Get tournament info
        tournament_info = data.get("Tournament", {})
        if isinstance(tournament_info, dict):
            tournament_name = tournament_info.get("Name", "")
            tournament_id = str(tournament_info.get("Id", ""))
        else:
            tournament_name = str(tournament_info)
            tournament_id = ""

        # 1. Check tournament ID match first (most specific)
        if expected_tournament_id and tournament_id:
            if tournament_id == expected_tournament_id:
                return True
            # If we have an expected ID but it doesn't match, this is not the right tournament
            return False

        # 2. Check exact tournament name match
        if expected_tournament_name:
            if tournament_name.strip() == expected_tournament_name.strip():
                return True

        # 3. Check format in tournament name
        expected_format_lower = expected_format.lower()
        if expected_format_lower not in tournament_name.lower():
            return False

        # 4. If we have an expected winner, check standings
        if expected_winner:
            standings = data.get("Standings", [])
            if standings:
                # Find the 1st place player (lowest rank)
                first_place = min(
                    standings, key=lambda s: s.get("Rank", float("inf")), default=None
                )
                if first_place:
                    actual_winner = first_place.get("Player", "").strip()
                    expected_winner_clean = expected_winner.strip()
                    if actual_winner == expected_winner_clean:
                        return True
                    # If winner doesn't match, this is probably not the right tournament
                    return False

        # 5. Default: format matches, so it's a candidate
        return True

    except Exception:
        # If we can't read/parse the file, assume it's not a match
        return False


def _list_candidate_files(day_dir: Path, format_slug: str) -> List[Path]:
    """List files in the day directory that start with the format slug."""
    if not day_dir.exists() or not day_dir.is_dir():
        return []
    candidates: List[Path] = []
    for p in day_dir.iterdir():
        if (
            p.is_file()
            and p.suffix.lower() == ".json"
            and p.name.lower().startswith(f"{format_slug}-")
        ):
            candidates.append(p)
    return sorted(candidates)


def _list_candidate_files_by_content(
    day_dir: Path,
    format_name: str,
    tournament_name: str = None,
    tournament_id: str = None,
    expected_winner: str = None,
) -> List[Path]:
    """
    Fallback: List files in the day directory by reading their JSON content
    and checking if they match the expected criteria.
    """
    if not day_dir.exists() or not day_dir.is_dir():
        return []
    candidates: List[Path] = []
    for p in day_dir.iterdir():
        if (
            p.is_file()
            and p.suffix.lower() == ".json"
            and _check_tournament_match(
                p, format_name, tournament_name, tournament_id, expected_winner
            )
        ):
            candidates.append(p)
    return sorted(candidates)


def find_rounds_file(criteria: TournamentSearchCriteria) -> Optional[Path]:
    """
    Attempt to locate the rounds JSON file for a tournament.

    Returns the Path if exactly one candidate is found; otherwise None.
    """
    if criteria.source == TournamentSource.OTHER:
        return None

    base = _get_base_folder_for_source(criteria.source)
    if not base:
        return None

    yyyy = f"{criteria.date.year:04d}"
    mm = f"{criteria.date.month:02d}"
    dd = f"{criteria.date.day:02d}"
    day_dir = base / yyyy / mm / dd
    fmt_slug = _format_slug(criteria.format_name)

    # Try 1: Use filename-based matching (current approach)
    candidates = _list_candidate_files(day_dir, fmt_slug)
    if len(candidates) == 1:
        # print(f"TOURNAMENT FILE: {candidates[0]}")
        return candidates[0]
    elif len(candidates) > 1:
        # If we have a specific tournament name, proceed to content-based matching
        # to disambiguate; otherwise warn and return None
        if not criteria.tournament_name:
            # Only warn once per day/format combination
            warn_key = f"{fmt_slug}|{yyyy}-{mm}-{dd}"
            if (
                criteria.warned_multiple is not None
                and warn_key not in criteria.warned_multiple
            ):
                print(
                    f"  ⚠️ Multiple rounds files match {fmt_slug} on {yyyy}-{mm}-{dd}: {len(candidates)} candidates; skipping for now"
                )
                for candidate in candidates:
                    print(f"    - {candidate}")
                criteria.warned_multiple.add(warn_key)
            return None
        # Continue to content-based matching with the filename candidates

    # Try 2: Fallback to content-based matching
    # If we have filename candidates from step 1, check only those; otherwise scan all files
    if len(candidates) > 1:
        # We have multiple filename candidates, check their content for exact tournament name match
        content_candidates = []
        for candidate in candidates:
            if _check_tournament_match(
                candidate,
                criteria.format_name,
                criteria.tournament_name,
                criteria.tournament_id,
                criteria.expected_winner,
            ):
                content_candidates.append(candidate)
    else:
        # No filename candidates, scan all files by content
        content_candidates = _list_candidate_files_by_content(
            day_dir,
            criteria.format_name,
            criteria.tournament_name,
            criteria.tournament_id,
            criteria.expected_winner,
        )
    if len(content_candidates) == 1:
        # print(f"TOURNAMENT FILE (by content): {content_candidates[0]}")
        return content_candidates[0]
    elif len(content_candidates) > 1:
        # If we have multiple candidates but provided a tournament name, try exact match priority
        if criteria.tournament_name:
            exact_matches = []
            for candidate in content_candidates:
                try:
                    import json

                    data = json.loads(candidate.read_text(encoding="utf-8"))
                    tournament_info = data.get("Tournament", {})
                    actual_name = (
                        tournament_info.get("Name", "")
                        if isinstance(tournament_info, dict)
                        else str(tournament_info)
                    )
                    if actual_name.strip() == criteria.tournament_name.strip():
                        exact_matches.append(candidate)
                except Exception:
                    continue

            if len(exact_matches) == 1:
                # Found exactly one exact tournament name match
                return exact_matches[0]

        # Still multiple candidates, show warning
        warn_key = f"content-{criteria.format_name}|{yyyy}-{mm}-{dd}"
        if (
            criteria.warned_multiple is not None
            and warn_key not in criteria.warned_multiple
        ):
            print(
                f"  ⚠️ Multiple rounds files match format '{criteria.format_name}' by content on {yyyy}-{mm}-{dd}: {len(content_candidates)} candidates; skipping for now"
            )
            for candidate in content_candidates:
                print(f"    - {candidate}")
            criteria.warned_multiple.add(warn_key)
        return None

    # No matches found
    return None
