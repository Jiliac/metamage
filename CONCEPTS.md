# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Data layer

### MetaDataSource
The frozen data contract the web explorer renders against — an interface whose methods (`getMetaReport`, `getArchetypeDetail`, `getMatchupMatrix`, …) return typed DTOs that every route consumes. Backend implementations (fixtures, Postgres) are interchangeable behind it and derived math lives outside it, so the fixtures backend stays the parity oracle.
*Aliases:* datasource interface, datasource contract

### DATA_SOURCE
The single environment switch that selects the `MetaDataSource` backend (currently `fixtures` or `postgres`). An unknown value is a hard error, never a silent fallback; the choice is memoized for the process.

### Art map
The build-time map of each archetype's signature card — its most-played non-land main-deck card, with a Scryfall `art_crop` URL — generated offline and consumed statically by the Postgres backend. Missing entries fall back to the mana-gradient placeholder in the UI; no runtime Scryfall calls happen in the request path.
*Avoid:* art lookup, signature card API

## Domain

### Archetype
A named deck family within one format that entries are classified into. Each has a color identity (guild code), a signature card, and computed presence/rank metrics. `Unknown` and `Conflict` are special bucket archetypes that absorb unclassified entries and are de-emphasized in the UI.

### Window
The start/end date range that scopes every meta query. All presence, record, and matchup numbers are computed within one window; the UI treats changing it as a full data reload.

### Matchup
The head-to-head record of one archetype against another within a window, counted one-sidedly from each side's entry so a pair's games appear in both cells with complementary win/loss splits.

## Flagged ambiguities

*"share" had been used for both match-weighted and entry-weighted presence — match-weighted is canonical; entry-weighted is exposed separately where needed.*
