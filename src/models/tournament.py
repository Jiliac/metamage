from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Text,
    Boolean,
    Index,
    UniqueConstraint,
    Enum,
)
from sqlalchemy.orm import relationship
from .base import Base, uuid_pk, TimestampMixin
import enum


class TournamentSource(enum.Enum):
    MTGO = "MTGO"
    MELEE = "MELEE"
    OTHER = "OTHER"


class MatchResult(enum.Enum):
    WIN = "WIN"
    LOSS = "LOSS"
    DRAW = "DRAW"


class BoardType(enum.Enum):
    MAIN = "MAIN"
    SIDE = "SIDE"


class Tournament(Base, TimestampMixin):
    __tablename__ = "tournaments"

    id = uuid_pk()
    name = Column(String(200), nullable=False, index=True)
    date = Column(DateTime, nullable=False, index=True)
    format_id = Column(
        String(36),
        ForeignKey("formats.id", name="fk_tournaments_format"),
        nullable=False,
        index=True,
    )
    source = Column(
        Enum(TournamentSource), nullable=False, default=TournamentSource.OTHER
    )
    link = Column(Text, nullable=True)  # URL to tournament page

    # Relationships
    format = relationship("Format", back_populates="tournaments")
    entries = relationship(
        "TournamentEntry", back_populates="tournament", passive_deletes=True
    )

    def __repr__(self):
        return f"<Tournament(id={self.id}, name='{self.name}', date='{self.date}')>"


class TournamentEntry(Base, TimestampMixin):
    __tablename__ = "tournament_entries"

    id = uuid_pk()
    tournament_id = Column(
        String(36),
        ForeignKey(
            "tournaments.id",
            name="fk_tournament_entries_tournament",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    player_id = Column(
        String(36),
        ForeignKey("players.id", name="fk_tournament_entries_player"),
        nullable=False,
        index=True,
    )
    archetype_id = Column(
        String(36),
        ForeignKey("archetypes.id", name="fk_tournament_entries_archetype"),
        nullable=False,
        index=True,
    )
    wins = Column(Integer, nullable=False, default=0)
    losses = Column(Integer, nullable=False, default=0)
    draws = Column(Integer, nullable=False, default=0)
    decklist_url = Column(Text, nullable=True)

    # Relationships
    tournament = relationship("Tournament", back_populates="entries")
    player = relationship("Player", back_populates="tournament_entries")
    archetype = relationship("Archetype", back_populates="tournament_entries")
    deck_cards = relationship("DeckCard", back_populates="entry", passive_deletes=True)
    matches = relationship(
        "Match",
        foreign_keys="[Match.entry_id]",
        back_populates="entry",
        passive_deletes=True,
    )
    opponent_matches = relationship(
        "Match",
        foreign_keys="[Match.opponent_entry_id]",
        back_populates="opponent_entry",
        passive_deletes=True,
    )

    # Constraints
    __table_args__ = (
        UniqueConstraint("tournament_id", "player_id", name="uq_tournament_player"),
    )

    def __repr__(self):
        return f"<TournamentEntry(id={self.id}, player_id={self.player_id}, wins={self.wins})>"


class DeckCard(Base, TimestampMixin):
    __tablename__ = "deck_cards"

    id = uuid_pk()
    entry_id = Column(
        String(36),
        ForeignKey(
            "tournament_entries.id", name="fk_deck_cards_entry", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    card_id = Column(
        String(36),
        ForeignKey("cards.id", name="fk_deck_cards_card"),
        nullable=False,
        index=True,
    )
    count = Column(Integer, nullable=False)
    board = Column(Enum(BoardType), nullable=False, default=BoardType.MAIN)

    # Relationships
    entry = relationship("TournamentEntry", back_populates="deck_cards")
    card = relationship("Card", back_populates="deck_cards")

    # Constraints
    __table_args__ = (
        UniqueConstraint("entry_id", "card_id", "board", name="uq_entry_card_board"),
    )

    def __repr__(self):
        return f"<DeckCard(entry_id={self.entry_id}, card_id={self.card_id}, count={self.count})>"


class Match(Base, TimestampMixin):
    __tablename__ = "matches"

    id = uuid_pk()
    entry_id = Column(
        String(36),
        ForeignKey(
            "tournament_entries.id", name="fk_matches_entry", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    opponent_entry_id = Column(
        String(36),
        ForeignKey(
            "tournament_entries.id",
            name="fk_matches_opponent_entry",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    result = Column(Enum(MatchResult), nullable=False)
    mirror = Column(Boolean, nullable=False, default=False)  # same archetype matchup
    pair_id = Column(
        String(36), nullable=False, index=True
    )  # UUID to group both sides of match

    # Relationships
    entry = relationship(
        "TournamentEntry", foreign_keys=[entry_id], back_populates="matches"
    )
    opponent_entry = relationship(
        "TournamentEntry",
        foreign_keys=[opponent_entry_id],
        back_populates="opponent_matches",
    )

    def __repr__(self):
        return (
            f"<Match(id={self.id}, entry_id={self.entry_id}, result='{self.result}')>"
        )


# Performance indexes
Index("idx_tournament_date_format", Tournament.date, Tournament.format_id)
Index(
    "idx_entry_tournament_player",
    TournamentEntry.tournament_id,
    TournamentEntry.player_id,
)
Index("idx_deck_card_entry_board", DeckCard.entry_id, DeckCard.board)
Index("idx_match_entry_opponent", Match.entry_id, Match.opponent_entry_id)
