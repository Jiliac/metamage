---
target: the meta overview (/meta/[format])
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/valentin/Development/mtg/metamage/web/src/app/meta/[format]/page.tsx"
target_fingerprint: "sha256:92c681ec8660a46d0933c265c8be2dfa01d38ee18b9b6282ec24b824cd72be9c"
target_path: /Users/valentin/Development/mtg/metamage/web/src/app/meta/[format]/page.tsx
timestamp: 2026-10-11T10-45-04Z
slug: src-app-meta-format-page-tsx
---
Method: dual-agent (A: design review · B: detector + overlay), both Fable subagents.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Window change is a full reload with no page-level loading signal (LensBar Suspense fallback is `null`) |
| 2 | Match system / real world | 2 | "The Ledger", "The moat", "clustered by player", "√ scale", "collapsed tail": system and stats jargon, undefined |
| 3 | User control and freedom | 2 | No "reset lens" control anywhere, though the empty state tells users to "clear the filters" |
| 4 | Consistency and standards | 3 | Matrix row WR is integer, table is one decimal; KPI "Decks" counts entries; tiles rounded, everything else cut |
| 5 | Error prevention | 3 | Params clamped and defaulted; but the "Win rate" column silently sorts by CI lower bound `wrLo` |
| 6 | Recognition rather than recall | 2 | Matrix column heads are rank numbers only: 12-item number→name map held in working memory |
| 7 | Flexibility and efficiency | 3 | Full tab order, shareable URLs, presets; no shortcuts, no link from matrix hero to the full N×N |
| 8 | Aesthetic and minimalist | 2 | The same ranking rendered three times (tiles, table, scatter); six art tiles push the moat below the fold |
| 9 | Error recovery | 2 | `page.tsx` never passes `widenHref`, so the promised "Widen the window" CTA never renders |
| 10 | Help and documentation | 2 | Section subtitles explain encodings but are the smallest text on the page; no glossary link |
| **Total** | | **24/40** | **Acceptable (60%)** |

## Design Specificity Verdict

**LLM assessment:** Authored for MetaMage, not interchangeable: the parchment/bronze ledger, WUBRG hairline, notched chrome, mana pips as identity, Scryfall plates, and a matrix whose fill is confidence. Caveats: the identity rests on Apple-only fonts (`Optima`, `Avenir Next`); Windows gets Candara/Segoe, Android gets Roboto for both. The lower half (KPI triad, TanStack table, Recharts scatter with side legend) is generic analytics furniture.

**Deterministic scan:** CLI scan of `src/app` + `src/components` (53 files): 1 advisory finding, `bounce-easing` `cubic-bezier(.2,.9,.3,1.4)` at `web/src/components/charts/WrPresenceScatter.tsx:197`. In-page detector (localhost, fixture data, 500px mobile width): overview 15 findings = `low-contrast` ×9 (rank bubbles: `#16130e` on `--mid #6e7280`, 3.9:1), `kicker-above-heading` ×4, `cramped-padding` ×1, `undersized-ui-text` ×1 (9.5px rank numerals), `bounce-easing` ×1. Matrix page: clean. Archetype page: `skipped-heading` ×1 (`<h1>` → `<h3>`). Desktop width not scanned.

Agreement: contrast and sub-11px type on rank numerals. Detector-only: overshoot easing, skipped heading, cramped card. Sanctioned exception: the 4 `kicker-above-heading` hits are the Ledger's gold eyebrows, a named rule of the committed world.

## Overall Impression

The top of the page is the most confident thing in the category, and the matrix is the best-designed object on the site. But the page opens with six paintings and a sentence the product's own CI rule can't support, and the moat arrives third. Biggest opportunity: make the lede trustworthy and put the matrix where the product principles say it belongs.

## What's Working

- The matrix cell: `color-mix` confidence fill, wr% over record, dashed mirrors, gold cross-highlight, CI tooltip.
- Identity numbers travel: same presence rank on tile badge, matrix heads, table, and scatter dot.
- Keyboard and focus: sensible tab order and a visible 2px gold offset ring on every stop.

## Priority Issues

**[P1] The lede contradicts the headline and makes unsupported claims.** `bestPerforming` is "highest WR that isn't the leader" regardless of whether it beats the leader (`web/src/app/meta/[format]/page.tsx:199-204`); point estimates only, overlapping CIs; no thin-sample hedge on Vintage. Fix: emit the edge clause only when it beats the leader; print the interval; gate "edge" on non-overlapping CIs; `LowSampleNotice` under the lede below a floor. Command: `/impeccable clarify`

**[P1] The moat sits two scrolls down on desktop and ~2,600px down on a phone.** Six large tiles plus a 3–4-row mobile LensBar precede the matrix. Fix: matrix directly under headline + KPIs; tiles demoted to a compact strip or made the matrix row headers; mobile LensBar collapses to a one-line summary; "your deck" shortcut remembering `?row`. Command: `/impeccable layout`

**[P1] Typography is Apple-only; the brand disappears on Android.** Fix: self-hosted display face via `next/font/local`, `font-display: swap`, size-adjusted fallback. Command: `/impeccable typeset`

**[P2] Contrast fails against WCAG 2.2 AA.** Light: gold eyebrows 4.08:1, `--good` 3.93:1, `--ink-3` on `--raised` 4.31:1 (4.19:1 dark); both themes: rank numerals `--bg` on `--mid` ~3.1–3.9:1 at 9.5–10px; 10px records, 11px heads. Fix: darken light `--gold` ≈`#7a5e1c` and `--good` ≈`#0b6f5c`; low-N cells to `--ink-2`; rank numerals in `--ink`, min 11px. Command: `/impeccable harden`

**[P2] "Honest buckets" and the thin-sample hedge are absent from the overview.** `hiddenBuckets`/`showBucketsHref`/`belowFloor` never passed to `MetaTable`; `LowSampleNotice` unused; `widenHref` never passed to `EmptyState`. Command: `/impeccable distill`

## Persona Red Flags

**Alex:** no keyboard shortcuts; "Win rate" sorts by `wrLo` silently; no link from the matrix hero to the full 20×20; no loading state on window change.

**Sam:** matrix is a flat CSS grid without table semantics; hover cross-highlight mouse-only; contrast failures; 9.5–10px type; 200% zoom horizontal-scrolls inside the frame with no affordance.

**Dana (event-prepping phone user):** ~2,600px to the matchup list; 12-item `Select` to find her deck, absent if ranked 13–20; `matrix:` seam keys on pointer so iPad with/without trackpad get different UIs; Roboto on Android.

## Minor Observations

- Copy vs. voice: "The Ledger ·", "The moat", "Nobody else publishes this.", "The decks to beat".
- Matrix row header clips long names (Vintage "Esper Lurrus Control"); WR cut to "4".
- Archetype page: h1 → h3 skips a level; Recent decks column outruns the decklist.
- Missing art renders as a flat dark panel in dark mode.
- "Top 20 · min 80" → "Top 20 · ≥80 matches"; KPI "Decks" → "Deck entries"; "PRESENCE · √ SCALE".
- Scatter dot pop overshoot easing (1.4).
- Section subtitles (13.5px) are the smallest explanatory text.
- Footer shows the path, not the full URL.

## Questions to Consider

1. If the matrix is the moat, why does the page open with six paintings?
2. Would a plain ledger line be more on-voice and more trusted than "winning the room"?
3. Tiles, table, scatter render one ranking. Which would you delete tomorrow?
