from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Text,
    Index,
    Enum,
    UniqueConstraint,
    Boolean,
)
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator, VARCHAR
from .base import Base, uuid_pk, TimestampMixin
import enum


class ChangeType(enum.Enum):
    BAN = "BAN"
    SET_RELEASE = "SET_RELEASE"


class CaseInsensitiveText(TypeDecorator):
    """SQLite equivalent of PostgreSQL CITEXT - case insensitive text."""

    impl = VARCHAR
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return value.lower()
        return value

    def process_result_value(self, value, dialect):
        return value


class Format(Base, TimestampMixin):
    __tablename__ = "formats"

    id = uuid_pk()
    name = Column(CaseInsensitiveText(100), nullable=False)

    # Constraints
    __table_args__ = (UniqueConstraint("name", name="uq_format_name"),)

    # Relationships
    tournaments = relationship("Tournament", back_populates="format")
    meta_changes = relationship("MetaChange", back_populates="format")
    archetypes = relationship("Archetype", back_populates="format")

    def __repr__(self):
        return f"<Format(id={self.id}, name='{self.name}')>"


class Set(Base, TimestampMixin):
    __tablename__ = "sets"

    id = uuid_pk()
    code = Column(
        String(10), nullable=False, unique=True, index=True
    )  # e.g., "ROE", "2XM"
    name = Column(String(200), nullable=False)  # e.g., "Rise of the Eldrazi"
    set_type = Column(String(50), nullable=True)  # e.g., "expansion", "masters"
    released_at = Column(DateTime, nullable=False, index=True)

    # Relationships
    cards = relationship("Card", back_populates="first_printed_set")

    def __repr__(self):
        return f"<Set(id={self.id}, code='{self.code}', name='{self.name}')>"


class Player(Base, TimestampMixin):
    __tablename__ = "players"

    id = uuid_pk()
    handle = Column(String(100), nullable=False)
    normalized_handle = Column(CaseInsensitiveText(100), nullable=False, index=True)

    # Relationships
    tournament_entries = relationship("TournamentEntry", back_populates="player")

    def __repr__(self):
        return f"<Player(id={self.id}, handle='{self.handle}')>"


class Card(Base, TimestampMixin):
    __tablename__ = "cards"

    id = uuid_pk()
    name = Column(CaseInsensitiveText(200), nullable=False, index=True)
    scryfall_oracle_id = Column(
        String(36), unique=True, nullable=False, index=True
    )  # UUID
    is_land = Column(Boolean, nullable=False, default=False)
    colors = Column(String(5), nullable=True)  # e.g., "WUB", "R", "" for colorless
    first_printed_set_id = Column(
        String(36),
        ForeignKey("sets.id", name="fk_card_first_printed_set"),
        nullable=True,
        index=True,
    )
    first_printed_date = Column(DateTime, nullable=True, index=True)

    # Relationships
    deck_cards = relationship("DeckCard", back_populates="card")
    card_colors = relationship(
        "CardColor", back_populates="card", cascade="all, delete-orphan"
    )
    first_printed_set = relationship("Set", back_populates="cards")

    def __repr__(self):
        return f"<Card(id={self.id}, name='{self.name}')>"


class CardColor(Base, TimestampMixin):
    __tablename__ = "card_colors"

    id = uuid_pk()
    card_id = Column(
        String(36),
        ForeignKey("cards.id", name="fk_card_colors_card", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    color = Column(String(1), nullable=False)  # W, U, B, R, G

    # Relationships
    card = relationship("Card", back_populates="card_colors")

    # Constraints
    __table_args__ = (
        UniqueConstraint("card_id", "color", name="uq_card_color"),
        Index("idx_card_color", "card_id", "color"),
    )

    def __repr__(self):
        return f"<CardColor(card_id={self.card_id}, color='{self.color}')>"


class Archetype(Base, TimestampMixin):
    __tablename__ = "archetypes"

    id = uuid_pk()
    format_id = Column(
        String(36),
        ForeignKey("formats.id", name="fk_archetype_format"),
        nullable=False,
        index=True,
    )
    name = Column(CaseInsensitiveText(100), nullable=False)
    color = Column(String(10), nullable=True)  # e.g., "BR", "UB", "G"

    # Relationships
    format = relationship("Format", back_populates="archetypes")
    tournament_entries = relationship("TournamentEntry", back_populates="archetype")

    # Constraints
    __table_args__ = (
        UniqueConstraint("format_id", "name", name="uq_archetype_format_name"),
    )

    def __repr__(self):
        return f"<Archetype(id={self.id}, name='{self.name}', color='{self.color}')>"


class MetaChange(Base, TimestampMixin):
    __tablename__ = "meta_changes"

    id = uuid_pk()
    format_id = Column(
        String(36),
        ForeignKey("formats.id", name="fk_meta_changes_format"),
        nullable=False,
        index=True,
    )
    date = Column(DateTime, nullable=False, index=True)
    change_type = Column(Enum(ChangeType), nullable=False)
    description = Column(Text, nullable=True)
    set_code = Column(String(10), nullable=True)  # if change is set release

    # Relationships
    format = relationship("Format", back_populates="meta_changes")

    def __repr__(self):
        return (
            f"<MetaChange(id={self.id}, type='{self.change_type}', date='{self.date}')>"
        )


# Create indexes for performance
Index("idx_meta_change_format_date", MetaChange.format_id, MetaChange.date)

# SQLite FTS5 virtual table for archetype fuzzy search
# Note: This needs to be created via raw SQL as SQLAlchemy doesn't directly support FTS virtual tables
# Example SQL to create:
# CREATE VIRTUAL TABLE archetype_fts USING fts5(name, archetype_id, content='archetypes', content_rowid='rowid');
# INSERT INTO archetype_fts(name, archetype_id) SELECT name, id FROM archetypes;
