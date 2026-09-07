# Rule edit recipes

Worked examples of the four common JSON-rule edits when resolving Conflict or Unknown buckets.
Files live in `~/Development/mtg/Parser/MTGOFormatData/Formats/<Format>/Archetypes/`.

## Recipe 1 — Exclude-by-card (resolve a 2-rule overlap)

When two rules both fire because their trigger sets intersect on real decks. Pick the "winner" (the archetype the player is actually piloting) and add a `DoesNotContain` to the _loser_ listing the winner's signature card.

Example — Tron + Red Madness collision on Gruul Tron splashing 1× Fiery Temper:

```json
{
  "Name": "Red Madness",
  "Conditions": [
    { "Type": "InMainboard", "Cards": ["Fiery Temper"] },
    { "Type": "DoesNotContain", "Cards": ["Goblin Tomb Raider"] },
    { "Type": "DoesNotContain", "Cards": ["Dread Return"] },
    { "Type": "DoesNotContain", "Cards": ["Urza's Tower"] },
    { "Type": "DoesNotContain", "Cards": ["Urza's Power Plant"] },
    { "Type": "DoesNotContain", "Cards": ["Urza's Mine"] }
  ]
}
```

Use when the loser's archetype should never coexist with the winner's signature land/creature/payoff.

## Recipe 2 — Add a Variant (legitimate hybrid deck)

When the deck is a real archetype that combines two themes — give it its own label rather than picking a side. Add a `Variants[]` entry to whichever parent archetype is the better umbrella.

```json
{
  "Name": "Ephemerate",
  "Conditions": [
    {
      "Type": "OneOrMoreInMainboard",
      "Cards": ["Ephemerate", "Ghostly Flicker"]
    }
  ],
  "Variants": [
    {
      "Name": "Ephemerate Tron",
      "IncludeColorInName": false,
      "Conditions": [{ "Type": "InMainboard", "Cards": ["Urza's Mine"] }]
    }
  ]
}
```

Variant Conditions are _additional_ requirements on top of the parent — not a replacement.

## Recipe 3 — Color-aware split (`IncludeColorInName: true`)

When the same shell shows up in multiple color pairs. Set `IncludeColorInName: true` on the rule and let the parser auto-prefix `Naya / Boros / Jeskai / …`. Saves you from writing N near-identical files.

```json
{
  "Name": "Synthesizer",
  "IncludeColorInName": true,
  "Conditions": [
    { "Type": "InMainboard", "Cards": ["Experimental Synthesizer"] },
    { "Type": "DoesNotContain", "Cards": ["Goblin Tomb Raider"] },
    { "Type": "DoesNotContain", "Cards": ["Basilisk Gate"] }
  ]
}
```

Combine with `DoesNotContain` to keep a single colored sibling out (e.g. `Boros Synthesizer` is intentionally a _different_ archetype, lives in its own file).

## Recipe 4 — Fog-style positive guard (rescue Unknowns)

When an archetype has an explicit `DoesNotContain` that knocks out a sub-archetype which then falls into Unknown. Create a sibling JSON with the inverted condition.

Parent (existing):

```json
{
  "Name": "Gates",
  "Conditions": [
    { "Type": "InMainboard", "Cards": ["Basilisk Gate"] },
    { "Type": "DoesNotContain", "Cards": ["Moment's Peace"] }
  ]
}
```

Sibling (rescue file):

```json
{
  "Name": "Fog Gates",
  "Conditions": [
    { "Type": "InMainboard", "Cards": ["Basilisk Gate"] },
    { "Type": "InMainboard", "Cards": ["Moment's Peace"] }
  ]
}
```

This is the right fix when the `DoesNotContain` was carving out a _real_ archetype, not just protecting against a false positive.

## Anti-pattern — narrowing the trigger

Tempting and almost always wrong:

```json
// BEFORE — broad trigger, conflicts with Gates
{ "Type": "OneOrMoreInMainboard", "Cards": ["Ephemerate", "Ghostly Flicker"] }

// AFTER — narrowed; "fixes" the Gates conflict but pushes
// every Ephemerate-only deck into Unknown
{ "Type": "InMainboard", "Cards": ["Ghostly Flicker"] }
```

If a card looks "too splashable", verify by counting how many Unknown decks contain it. Concentrated cards should stay in the trigger; resolve overlaps with `DoesNotContain` instead.

## Verification

After every JSON edit:

1. Re-run the parser to update `tournament.db`.
2. Run the bucket-quantification SQL from `SKILL.md` Step 1 for the same date window.
3. Check that the change in `unknown` and `conflict` counts matches the expected delta (sum of entries you tagged in Step 3/4 queries). Drift means another rule was affected — investigate before the next edit.
