# MTG Meta Visualization Guide (v2, ggplot2)
Player‑centric, Karsten‑style presentation with mirrors included.

This guide specifies what the metagame visuals should look like and how to compose them into one or more publishable figures. It is intentionally tool- and query-agnostic (no SQL). When we say “win rate,” we include mirrors and count draws as 0.5 to reflect a player’s expected results in the real field.

Goals
- Communicate what’s popular, how decks fare overall and head‑to‑head, and where attention should go.
- Be scannable at a glance while remaining precise.
- Be consistent (colors, ordering, formatting) across all panels and reports.

General conventions
- Time window: a clearly stated date range (e.g., “Standard, Jan–Mar 2025”). All panels use the same window.
- Sample size: annotate with counts; visually de‑emphasize fragile estimates.
- Mirrors: included by default. The A–A diagonal in a matchup matrix is 50% by definition.
- Draws: Excluded from the WR calculation
- Top N: show the top N archetypes (e.g., 12–20), collapse the rest to “Other” for presence only; do not include “Other” in matchup/WR panels.
- Ordering: unless stated otherwise, sort by presence (descending). Secondary order for ties: win rate (descending).
- Colors: assign one distinct, colorblind‑safe color per archetype and reuse it across every panel. Keep “Other” as a neutral gray.
- Annotation style:
  - Percentages rounded to 0.1% for presence and 0.1–1% for win rate depending on space.
  - Records as “W‑L‑D (WR%)” where appropriate.
  - Confidence intervals shown as thin caps with subtle color; keep CI method note in the caption.

Typography and style
- Font: clean sans (Inter, Source Sans, or system UI). Title 16–18 pt, axis/labels 10–11 pt, annotations 9–10 pt.
- Themes: minimal grid; light horizontal gridlines on bar charts; no vertical grid on the matrix.
- Palette: colorblind‑safe discrete palette (e.g., Okabe–Ito) or curated brand palette of 12–20 hues. Keep luminance balanced so dark = emphasis; avoid red/green conflicts in non‑diverging contexts.

Deliverables
- A single “Meta Overview” figure that can stand alone (matrix + presence + WR+CI + WR vs Presence).
- Optional: separate, larger exports of individual panels for detail views.
- A separate “Card Report” figure (see the end of this guide).

---

## 1) Matchup Matrix Heatmap (includes mirrors)
Purpose
- Show how archetypes fare head‑to‑head. Rows = “row deck vs column deck”. The diagonal is 50% and acts as a visual anchor.

Data needed per cell
- Games played (g) and win rate (wr) for row deck vs column deck, with draws as 0.5; mirrors included.

Design
- Layout:
  - Square matrix with rows and columns using the same ordered list of archetypes (top N).
  - Row labels left; column labels top, angled 35–45°.
- Color:
  - Diverging continuous scale centered at 50% (midpoint white/neutral).
  - Suggested endpoints: 35–65% for full saturation; values outside squish to ends.
  - Keep a legend labeled “WR”.
- Text:
  - Each tile shows “W‑L (WR%)” or just “WR%” when space is tight; smaller gray text for g if included (“WR% • g”).
  - A–A diagonal fixed to “50%” and filled with a neutral light.
- Small‑sample handling:
  - If g < 5: show a dot or diagonal hatch overlay and reduce tile saturation; still display the value but lighter.
- Ordering:
  - Default: presence order (most popular first).
  - Alternative (optional): optimal seriation (e.g., by average row WR) if it reveals structure better; keep consistent with other panels if you choose this.
- Accessibility:
  - Always show numeric text on tiles; color is secondary.
  - Provide a sparse gridline or thin separators to aid scanning.

---

## 2) Presence Bar Chart (share of entries)
Purpose
- Provide the popularity baseline and explain the matrix order.

Data needed per archetype
- Matches (n) and share (% of total matches) in the window.

Design
- Horizontal bars sorted by share (descending) for the same archetype list.
- Bars colored by archetype color; value labels at end of each bar as “xx.x% (n=###)”.
- “Other” appears last in muted gray if shown, with its share and n; do not color “Other” with an archetype color.
- Axis from 0% to max(share) with 5% ticks; percent formatting.
- Spacing: compact but legible; 0.6–0.7 bar width; 3–6 px gaps.

Caption
- “Presence = share of matches in the selected window.”

---

## 3) Win Rate per Archetype with 95% CI (mirrors included)
Purpose
- Rank archetypes by observed performance while communicating uncertainty.

Data needed per archetype
- Wins, losses, draws → games (g) and WR = (wins + 0.5*draws)/g.
- Confidence interval (recommend Wilson 95% on points/game); record string optional (“W‑L‑D”).

Design
- Horizontal bars sorted by WR (descending).
- For each bar:
  - Fill with the archetype color.
  - Overlay a thin CI whisker (wr_lo–wr_hi). If g is small (e.g., < 30), de‑saturate fill or place a subtle “low n” marker.
  - Right‑aligned label “xx.x% (g=###)”. Optionally add the record on a second, lighter line when space permits.
- Axis from 40% to 60% by default (symmetric about 50%) to highlight differences; expand to 35–65% for wider ranges.
- Optional mirror context:
  - Add a small, faint dot indicating mirror rate on a secondary guide below each bar (e.g., “mirror = 22%”) to help interpret lower overall WR for very popular decks.

Caption
- “Win rates include mirrors; draws count as 0.5. Error bars are 95% Wilson intervals.”

---

## 4) Win Rate vs Presence (bubble chart)
Purpose
- Snapshot of “how good” vs “how common” right now; ideal for identifying over‑ or under‑performers.

Data needed per archetype
- WR (incl. mirrors), presence share, entries (n).

Design
- Scatter plot with:
  - x = WR (0–1), y = presence (0–1).
  - Size = entries (area scaling), color = archetype color, labels = archetype names.
- Reference lines:
  - Vertical at 50% WR; horizontal at median presence (or a fixed 5–10% threshold).
  - Quadrants implicitly define “popular & strong”, “popular & weak”, etc.
- Labeling:
  - Use repel labeling; allow up to ~25 overlaps with smart nudges; small halo around text for readability.
  - Add a lightweight outline stroke to points for contrast on light backgrounds.
- Optional deltas:
  - If you also compute a previous window, draw faint arrows from prior position to current to show momentum.

Caption
- “Area ∝ entries. Reference lines at 50% WR and median presence.”

---

## Putting it together: “Meta Overview” hero figure
- Two recommended compositions:
  1) Karsten‑style split:
     - Left column: Presence (top), Win Rate + CI (bottom).
     - Right: Large Matchup Matrix.
  2) Tall stack:
     - Matrix on top; Presence, WR+CI, and WR vs Presence stacked below.
- Spacing and sizes:
  - Matrix should occupy ~55–65% of total width in split layout.
  - Keep consistent margins; align panel titles and axes.
- Titles:
  - Global title: “Standard Winrates: <Event/Window>”.
  - Subtitle: short context, e.g., “Results include mirrors; 95% CIs shown; top 15 archetypes”.

Export recommendations
- PNG (or SVG) at 300 DPI.
- Split layout: 2400×1400 px (approx. 8×4.7 in).
- Tall stack: 2000×2600 px (approx. 6.7×8.7 in).
- File names: docs/meta_overview.png and panel variants (meta_matrix.png, meta_presence.png, meta_wr_ci.png, meta_wr_presence.png).

---

## Card Report (single figure)
Purpose
- Highlight defining cards of the window and how they correlate with outcomes (correlation, not causation).

Panels (stacked)
A) Card Presence (bars)
- Horizontal bars for the top N non‑land cards (configurable), colored by a neutral palette (do not reuse archetype colors to avoid confusion).
- Labels “xx.x% (n=### entries)” where n is the number of decks containing the card at least once.
- Optionally facet by board (“MAIN”, “SIDE”) or present two adjacent bar charts.

B) Card Win Rate with 95% CI (bars)
- For each card, compute player‑side WR for matches where the player’s deck contains the card (mirror‑inclusive).
- Show bars sorted by WR with 95% CI whiskers; annotate with “xx.x% (g=###)”.
- De‑emphasize cards with very low g (lighter fill or small-n marker).

C) Card Win Rate vs Presence (bubble)
- x = WR, y = presence, size = entries_with_card; neutral color palette; labels for top right quadrant; repel to reduce overlap.
- Reference lines at 50% WR and median presence.

Optional additions
- Trends: small multiples showing presence over time for the top 12 cards.
- Synergy callouts: tiny side table listing the most common archetypes for each card (top 3) to provide context (“appears mostly in Rakdos, Grixis”).

Card Report composition and export
- Height‑heavier layout: Presence (30%), WR+CI (30%), Bubble (40%).
- Recommended export: 1800×2100 px, 300 DPI → docs/card_report.png.
- Caption: “Correlation only: card WR reflects the decks that choose the card. Mirrors included; draws count as 0.5.”

---

## Accessibility and QC checklist
- Numeric labels present on tiles and bars; color not strictly required to interpret values.
- All percentages are percent‑formatted; consistent rounding.
- Small‑sample indicators present (e.g., g < 5 for cells; g < 30 for bars).
- Colors are colorblind‑safe; “Other” is neutral gray; diagonals in matrix neutral.
- Axes start at zero for share bars; WR axes centered on 50% unless otherwise stated.
- Panels share the same archetype order and color mapping.
- Titles and captions explicitly state: mirrors included; CI method; date window; N archetypes.
- Exports use consistent sizes and margins; rasterized layers (if any) do not blur text.

FAQ (short)
- Why include mirrors? To answer the player’s question: “What do I expect to win if I bring this deck?” Mirrors are part of the field; excluding them biases popular decks toward 50%.
- Why show both share and WR? Popularity drives exposure; performance alone can be misleading without context on how often the deck appears.
- Why a matrix? It reveals structural rock‑paper‑scissors patterns that aggregate WRs can hide.

Implementation notes (ggplot2 only; no data code)
- Matrix: geom_tile + geom_text; scale_fill_gradient2 with midpoint=0.5; coord_equal; diagonal forced to 50% and light fill.
- Bars: geom_col + geom_errorbar; horizontal orientation with coord_flip; end labels with out‑of‑bar padding.
- Bubble: geom_point + repel labels; scale_size_area; reference lines via geom_hline/vline.
- Use a shared discrete scale for archetype colors in all panels.
