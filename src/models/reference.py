from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Text,
    Index,
    Enum,
    UniqueConstraint,
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
        String(36), unique=True, nullable=True, index=True
    )  # UUID

    # Relationships
    deck_cards = relationship("DeckCard", back_populates="card")

    def __repr__(self):
        return f"<Card(id={self.id}, name='{self.name}')>"


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
