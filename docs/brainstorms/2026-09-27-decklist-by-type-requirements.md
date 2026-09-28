---
date: 2026-09-27
topic: decklist-by-type
status: idea — needs a dedicated plan (ce-plan) before implementation
---

# Decklists Grouped by Card Type, with Card Image on Hover

## Summary

On the archetype page, the main deck is a flat card-adoption table. Players
read decklists grouped by card type. Group the main deck into type sections and
show the card image when hovering a card name. The same component should then
back the per-player decklist on the
[tournament page](2026-09-27-tournament-page-requirements.md).

---

## What the user wants

1. **Group the maindeck by type**, in this order:
   Creatures → Planeswalkers → Battles → Instants → Sorceries → Artifacts →
   Enchantments → Lands. (Mirrors MTGO/Arena/most sites. The user's own list
   was "land/creatures/instants/sorceries/artifacts/enchantment/planeswalker"
   and Battles were missing from it. Pick one order and use it everywhere.)
   Sideboard stays one flat list.
2. **Multi-type cards go in one bucket, chosen by priority.** A card appears
   exactly once, in the first matching bucket of:
   `Land > Creature > Planeswalker > Battle > Artifact > Enchantment > Instant > Sorcery`
   - Artifact Creature (Ornithopter), Enchantment Creature, Kindred X → Creature
   - Artifact Land (Darksteel Citadel), Dryad Arbor → Land
   - MDFCs / split / adventure cards: use the **front face** type line
     (Sink into Stupor → Instant, not Land). This matches how players count
     "lands" for mana purposes on paper lists.
   - Section headers show the summed count, e.g. "Creatures (14)".
3. **Card image on hover** (focus too, for keyboard users; tap on mobile):
   Scryfall `normal` image in a floating popover. Lazy-load it, don't prefetch
   the whole list.

---

## Data gap

`cards` stores only `is_land` and `colors`. There is **no type line**
(checked `src/models/reference.py` on 2026-09-27). Options for the plan:

- **A. Add `type_line` (front face) + `image_uri` to `cards`, backfill once
  from Scryfall bulk data** by `scryfall_oracle_id`, and populate it on
  ingest. Recommended: one migration, queries stay simple, and it also fixes
  hover images without runtime Scryfall calls.
- B. Resolve types at build/request time from a Scryfall bulk JSON shipped
  with the web app. No migration, but a large artifact and it goes stale.
- C. Call Scryfall per card at render. Rate limits, latency. No.

---

## Scope notes

- The archetype page shows an *aggregate* list (avg copies, % of decks). Decide
  in planning whether the grouped view is (a) the aggregate table split into
  type sections, (b) a synthesized "average/representative decklist" (e.g.
  the cards in ≥50% of decks at their modal count), or both. (b) is what
  people usually expect from "the decklist of an archetype".
- The hover-image component is reusable in the card adoption tables and the
  future tournament player view.
