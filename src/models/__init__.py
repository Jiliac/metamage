# Models module for Magic: The Gathering tournament data

from .base import Base, get_engine, get_session_factory, get_database_path, uuid_pk, generate_uuid
from .reference import Format, Player, Card, Archetype, MetaChange
from .tournament import Tournament, TournamentEntry, DeckCard, Match
from .tournament import TournamentSource, MatchResult, BoardType

__all__ = [
    # Base
    "Base",
    "get_engine",
    "get_session_factory",
    "get_database_path",
    "uuid_pk",
    "generate_uuid",
    # Reference models
    "Format",
    "Player",
    "Card",
    "Archetype",
    "MetaChange",
    # Tournament models
    "Tournament",
    "TournamentEntry",
    "DeckCard",
    "Match",
    # Enums
    "TournamentSource",
    "MatchResult",
    "BoardType",
]
