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


def find_rounds_file(
    date: datetime, format_name: str, source: TournamentSource
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

    candidates = _list_candidate_files(day_dir, fmt_slug)
    if len(candidates) == 1:
        # print(f"TOURNAMENT FILE: {candidates[0]}")
        return candidates[0]
    elif len(candidates) > 1:
        # Ambiguous for now; future improvement could disambiguate by tournament name or players
        print(
            f"  ⚠️ Multiple rounds files match {fmt_slug} on {yyyy}-{mm}-{dd}: {len(candidates)} candidates; skipping for now"
        )
        return None
    else:
        return None
