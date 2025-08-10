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
from typing import List, Optional

from models import TournamentSource


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


def _check_tournament_format_in_json(file_path: Path, expected_format: str) -> bool:
    """
    Read a JSON file and check if it matches the expected tournament format.

    Args:
        file_path: Path to the JSON file
        expected_format: Expected format name (e.g., 'pauper', 'modern')

    Returns:
        True if the file appears to be for the expected format
    """
    try:
        import json

        data = json.loads(file_path.read_text(encoding="utf-8"))

        # Check tournament name for format keywords
        tournament_info = data.get("Tournament", {})
        if isinstance(tournament_info, dict):
            tournament_name = tournament_info.get("Name", "").lower()
        else:
            # Sometimes Tournament is just a string name
            tournament_name = str(tournament_info).lower()

        # Check if the expected format appears in the tournament name
        expected_lower = expected_format.lower()
        if expected_lower in tournament_name:
            return True

        # Could add more sophisticated checks here (e.g., check deck formats, etc.)
        return False

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


def _list_candidate_files_by_content(day_dir: Path, format_name: str) -> List[Path]:
    """
    Fallback: List files in the day directory by reading their JSON content
    and checking if they match the expected format.
    """
    if not day_dir.exists() or not day_dir.is_dir():
        return []
    candidates: List[Path] = []
    for p in day_dir.iterdir():
        if (
            p.is_file()
            and p.suffix.lower() == ".json"
            and _check_tournament_format_in_json(p, format_name)
        ):
            candidates.append(p)
    return sorted(candidates)


def find_rounds_file(
    date: datetime,
    format_name: str,
    source: TournamentSource,
    warned_multiple: set = None,
) -> Optional[Path]:
    """
    Attempt to locate the rounds JSON file for a tournament.

    Returns the Path if exactly one candidate is found; otherwise None.
    """
    if source == TournamentSource.OTHER:
        return None

    base = _get_base_folder_for_source(source)
    if not base:
        return None

    yyyy = f"{date.year:04d}"
    mm = f"{date.month:02d}"
    dd = f"{date.day:02d}"
    day_dir = base / yyyy / mm / dd
    fmt_slug = _format_slug(format_name)

    # Try 1: Use filename-based matching (current approach)
    candidates = _list_candidate_files(day_dir, fmt_slug)
    if len(candidates) == 1:
        # print(f"TOURNAMENT FILE: {candidates[0]}")
        return candidates[0]
    elif len(candidates) > 1:
        # Only warn once per day/format combination
        warn_key = f"{fmt_slug}|{yyyy}-{mm}-{dd}"
        if warned_multiple is not None and warn_key not in warned_multiple:
            print(
                f"  ⚠️ Multiple rounds files match {fmt_slug} on {yyyy}-{mm}-{dd}: {len(candidates)} candidates; skipping for now"
            )
            warned_multiple.add(warn_key)
        return None

    # Try 2: Fallback to content-based matching
    content_candidates = _list_candidate_files_by_content(day_dir, format_name)
    if len(content_candidates) == 1:
        # print(f"TOURNAMENT FILE (by content): {content_candidates[0]}")
        return content_candidates[0]
    elif len(content_candidates) > 1:
        # Only warn once per day/format combination
        warn_key = f"content-{format_name}|{yyyy}-{mm}-{dd}"
        if warned_multiple is not None and warn_key not in warned_multiple:
            print(
                f"  ⚠️ Multiple rounds files match format '{format_name}' by content on {yyyy}-{mm}-{dd}: {len(content_candidates)} candidates; skipping for now"
            )
            warned_multiple.add(warn_key)
        return None

    # No matches found
    return None
