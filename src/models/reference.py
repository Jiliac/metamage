from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Index
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator, VARCHAR
from .base import Base


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


class Format(Base):
    __tablename__ = "formats"
    
    id = Column(Integer, primary_key=True)
    name = Column(CaseInsensitiveText(100), nullable=False, unique=True)
    
    # Relationships
    tournaments = relationship("Tournament", back_populates="format")
    meta_changes = relationship("MetaChange", back_populates="format")
    
    def __repr__(self):
        return f"<Format(id={self.id}, name='{self.name}')>"


class Player(Base):
    __tablename__ = "players"
    
    id = Column(Integer, primary_key=True)
    handle = Column(String(100), nullable=False)
    normalized_handle = Column(CaseInsensitiveText(100), nullable=False, index=True)
    
    # Relationships
    tournament_entries = relationship("TournamentEntry", back_populates="player")
    
    def __repr__(self):
        return f"<Player(id={self.id}, handle='{self.handle}')>"


class Card(Base):
    __tablename__ = "cards"
    
    id = Column(Integer, primary_key=True)
    name = Column(CaseInsensitiveText(200), nullable=False, index=True)
    scryfall_oracle_id = Column(String(36), unique=True, nullable=True, index=True)  # UUID
    
    # Relationships
    deck_cards = relationship("DeckCard", back_populates="card")
    
    def __repr__(self):
        return f"<Card(id={self.id}, name='{self.name}')>"


class Archetype(Base):
    __tablename__ = "archetypes"
    
    id = Column(Integer, primary_key=True)
    name = Column(CaseInsensitiveText(100), nullable=False, unique=True)
    color = Column(String(10), nullable=True)  # e.g., "BR", "UB", "G"
    companion = Column(String(100), nullable=True)  # companion card name if any
    
    # Relationships  
    tournament_entries = relationship("TournamentEntry", back_populates="archetype")
    
    def __repr__(self):
        return f"<Archetype(id={self.id}, name='{self.name}', color='{self.color}')>"


class MetaChange(Base):
    __tablename__ = "meta_changes"
    
    id = Column(Integer, primary_key=True)
    format_id = Column(Integer, ForeignKey("formats.id"), nullable=False, index=True)
    date = Column(DateTime, nullable=False, index=True)
    change_type = Column(String(20), nullable=False)  # BAN, UNBAN, SET_RELEASE, etc.
    description = Column(Text, nullable=False)
    card_name = Column(String(200), nullable=True)  # if change affects specific card
    set_code = Column(String(10), nullable=True)  # if change is set release
    
    # Relationships
    format = relationship("Format", back_populates="meta_changes")
    
    def __repr__(self):
        return f"<MetaChange(id={self.id}, type='{self.change_type}', date='{self.date}')>"


# Create indexes for performance
Index("idx_player_normalized_handle", Player.normalized_handle)
Index("idx_card_name", Card.name)
Index("idx_card_oracle_id", Card.scryfall_oracle_id)
Index("idx_meta_change_format_date", MetaChange.format_id, MetaChange.date)