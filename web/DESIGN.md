---
name: MetaMage
description: An editorial ledger of the Magic tournament metagame — parchment by day, Arena bronze by night, numbers set in tabular mono.
colors:
  # ---- light theme (parchment study) — the default --------------------------
  parchment: '#f1ebdc'
  vellum-surface-light: '#f9f5e9'
  parchment-raised-light: '#ece5d0'
  hairline-light: '#dcd2b8'
  hairline-strong-light: '#c5b892'
  ledger-ink-light: '#292418'
  ledger-ink-2-light: '#5f5741'
  ledger-ink-3-light: '#6a6045'
  bronze-gold-light: '#7a5e1c'
  bronze-gold-soft-light: '#b3924d'
  gold-wash-light: 'rgba(122, 94, 28, 0.1)'
  favoured-teal-light: '#0b6f5c'
  unfavoured-rose-light: '#b03a5e'
  neutral-mid-light: '#8a8574'
  reference-blue-light: '#7d97b8'
  # ---- dark theme (Arena bronze) ---------------------------------------------
  arena-bronze: '#16130e'
  bronze-surface-dark: '#1e1a13'
  bronze-raised-dark: '#282216'
  hairline-dark: '#37301e'
  hairline-strong-dark: '#4d422a'
  ledger-ink-dark: '#eae3ce'
  ledger-ink-2-dark: '#a99f85'
  ledger-ink-3-dark: '#9a9178'
  bronze-gold-dark: '#c9a855'
  bronze-gold-soft-dark: '#98803f'
  gold-wash-dark: 'rgba(201, 168, 85, 0.09)'
  favoured-teal-dark: '#2e9e8f'
  unfavoured-rose-dark: '#d45a7e'
  neutral-mid-dark: '#6e7280'
  reference-blue-dark: '#5f7ea6'
  # ---- mana chips — printed cardboard, constant in both themes ---------------
  chip-white: '#f5f0ce'
  chip-blue: '#abd8ee'
  chip-black: '#ccc5c0'
  chip-red: '#f4a78d'
  chip-green: '#9bd3ae'
  chip-ink: '#141010'
typography:
  display:
    fontFamily: "Newsreader, 'Newsreader Fallback', Optima, Candara, 'Segoe UI', system-ui, sans-serif"
    fontSize: 'clamp(30px, 4.5vw, 44px)'
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: 'normal'
  headline:
    fontFamily: "Newsreader, 'Newsreader Fallback', Optima, Candara, 'Segoe UI', system-ui, sans-serif"
    fontSize: '23px'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 'normal'
  title:
    fontFamily: "Newsreader, 'Newsreader Fallback', Optima, Candara, 'Segoe UI', system-ui, sans-serif"
    fontSize: '16.5px'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '0.01em'
  body:
    fontFamily: "'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  control:
    fontFamily: "'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: '0.02em'
  label:
    fontFamily: "'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: '11.5px'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '0.18em'
  data:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: '13.5px'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
    fontFeature: 'tabular-nums'
rounded:
  none: '0px'
  thumb: '4px'
  art: '8px'
  tile: '12px'
  pip: '9999px'
spacing:
  hair: '1px'
  xs: '4px'
  sm: '8px'
  cell: '14px'
  md: '16px'
  lg: '24px'
  section: '40px'
  section-lg: '56px'
components:
  knob:
    backgroundColor: 'transparent'
    textColor: '{colors.ledger-ink-2-light}'
    typography: '{typography.control}'
    rounded: '{rounded.none}'
    padding: '5px 12px'
  knob-hover:
    backgroundColor: 'transparent'
    textColor: '{colors.ledger-ink-light}'
  chip-active:
    backgroundColor: '{colors.bronze-gold-light}'
    textColor: '{colors.parchment}'
    typography: '{typography.control}'
    rounded: '{rounded.none}'
    padding: '5px 12px'
  button-gold:
    backgroundColor: 'transparent'
    textColor: '{colors.bronze-gold-light}'
    typography: '{typography.control}'
    rounded: '{rounded.none}'
    padding: '6px 12px'
  button-gold-hover:
    backgroundColor: '{colors.gold-wash-light}'
    textColor: '{colors.bronze-gold-light}'
  nav-link:
    backgroundColor: 'transparent'
    textColor: '{colors.ledger-ink-2-light}'
    rounded: '{rounded.none}'
    padding: '2px 0'
  nav-link-active:
    backgroundColor: 'transparent'
    textColor: '{colors.bronze-gold-light}'
  panel:
    backgroundColor: '{colors.vellum-surface-light}'
    textColor: '{colors.ledger-ink-light}'
    rounded: '{rounded.none}'
    padding: '20px'
  deck-tile:
    backgroundColor: '{colors.vellum-surface-light}'
    textColor: '{colors.ledger-ink-light}'
    typography: '{typography.title}'
    rounded: '{rounded.tile}'
    padding: '10px 14px 12px'
  kpi-stat:
    backgroundColor: '{colors.vellum-surface-light}'
    textColor: '{colors.ledger-ink-light}'
    typography: '{typography.data}'
    rounded: '{rounded.none}'
    padding: '14px 18px 12px'
  matrix-cell:
    backgroundColor: '{colors.parchment-raised-light}'
    textColor: '{colors.ledger-ink-light}'
    typography: '{typography.data}'
    rounded: '{rounded.none}'
    height: '48px'
  badge-tier:
    backgroundColor: 'transparent'
    textColor: '{colors.bronze-gold-light}'
    rounded: '{rounded.none}'
    padding: '2px 8px'
  badge-bucket:
    backgroundColor: 'transparent'
    textColor: '{colors.ledger-ink-3-light}'
    rounded: '{rounded.none}'
    padding: '2px 8px'
  input-field:
    backgroundColor: '{colors.parchment}'
    textColor: '{colors.ledger-ink-light}'
    typography: '{typography.data}'
    rounded: '{rounded.none}'
    padding: '4px 8px'
  tooltip:
    backgroundColor: '{colors.ledger-ink-light}'
    textColor: '{colors.parchment}'
    rounded: '{rounded.none}'
    padding: '6px 10px'
---

# Design System: MetaMage

## Overview

**Creative North Star: "The Gathering Ledger"**

MetaMage reads like a well-kept ledger of the tournament field: a gold eyebrow names the format and the window, a serif display headline states the leading fact as a plain sentence ("Broodscale is the most-played deck."), a ledger of labelled figures beneath it gives share, win rate and the 95% interval, and everything numeric below is set in tabular mono so columns of win rates and records line up like entries in a book. Card art appears as plates — the archetype's signature card cropped and framed — and is the only place the surface becomes pictorial. The mood is editorial and archival, quietly confident: it states sample sizes, intervals and records plainly and lets the figures carry the claim.

The material is paper in two states. By default the page is a parchment study (warm cream grounds, dark umber ink, muted bronze gold); when the visitor's system or the toggle asks for dark, the same ledger is lit as Arena bronze (near-black umber grounds, parchment-coloured ink, brighter gold). Depth is mostly tonal — background, surface, raised — with hairline rules doing the structural work and a single ambient shadow lifting the few things that are genuinely cards. Density is high but hierarchical: the page is organised into titled sections (eyebrow, headline, one-line description, then the panel) so a wall of numbers always has a heading above it. Two directions were confirmed as rejections: the stock shadcn / generic slate dashboard look, and the Goldfish / MTGTop8 wall-of-table density that offers no hierarchy.

Durable product commitments that constrain the visual system: the copy is analytical with no hype (numbers and confidence, never "best deck!"); the site must stay recognisable to the existing social audience that already knows the monthly meta images; and WCAG 2.2 AA is the standard — colour is never the only signal, text contrast is at least 4.5:1, and every control has a visible gold focus ring.

**Key Characteristics:**

- Ledger headline pattern on every page: gold eyebrow → serif H1 stating the fact → labelled figure rows with intervals; every section: eyebrow → serif H2 → one-line description.
- Numbers are always monospaced with tabular figures; prose is a humanist sans.
- Parchment by default, Arena bronze in dark mode; the same token names paint both.
- Gold is structure (eyebrows, frames, active lens, focus ring), never a data value.
- Rose↔teal is the only polarity pair; neutral grey is the midpoint; the pair is CVD-validated.
- Flat tonal layering with hairline rules; one ambient shadow, used sparingly.
- Cards are round, chrome is cut: art gets radius, panels are sharp, hero frames are notched.
- Confidence is ink: the matchup matrix fills cells in proportion to how sure the data is.

## Colors

A two-state paper palette — warm parchment or dark Arena bronze — written on in umber or parchment ink, structured with bronze gold, and read for value only through one teal/rose polarity pair.

### Primary

- **Bronze Gold** (`bronze-gold-light` / `bronze-gold-dark`): the structural accent. It colours eyebrows, the brand's "Mage", the active nav underline, the active format chip's fill, the Share control, tier badges, the share bar's cap, sort arrows, link hover and every focus ring. It is never applied to a win rate, a share, or any other measured quantity.
- **Bronze Gold Soft** (`bronze-gold-soft-light` / `bronze-gold-soft-dark`): the quieter gold for borders and bars — gold CTA borders, tier badge outlines, the share bar body, the toast's hairline, and the gradient that frames the matrix hero.
- **Gold Wash** (`gold-wash-light` / `gold-wash-dark`): a translucent gold tint for hover and rest states on structure — table row hover, gold control hover, the shadcn `accent` alias.

### Secondary

- **Favoured Teal** (`favoured-teal-light` / `favoured-teal-dark`): "winning" polarity. Tints a win-rate numeral only when the lower bound of its interval clears 50%, and is the positive pole of the matrix ink fill and the chart dots.
- **Unfavoured Rose** (`unfavoured-rose-light` / `unfavoured-rose-dark`): "losing" polarity, the mirror of teal; the shadcn `destructive` alias also resolves here.
- **Neutral Mid** (`neutral-mid-light` / `neutral-mid-dark`): the grey midpoint for an interval that straddles 50% in the charts (tier chart dots, scatter dots).
- **Reference Blue** (`reference-blue-light` / `reference-blue-dark`): the dashed 50% reference line in the scatter, CI and trend charts. Never used for data points.

### Neutral

- **Parchment / Arena Bronze** (`parchment` / `arena-bronze`): the page ground and the text colour of anything sitting on a gold fill (active chip, toast action).
- **Vellum Surface / Bronze Surface** (`vellum-surface-light` / `bronze-surface-dark`): every panel, card, popover, toast and the LensBar — one step lighter (light) or lighter-warmer (dark) than the ground.
- **Parchment Raised / Bronze Raised** (`parchment-raised-light` / `bronze-raised-dark`): the inset tone — matrix cells at rest and low-N, share-bar troughs, the art-placeholder gradient's base, the tabs list, the shadcn `muted` and `secondary` aliases.
- **Hairline / Hairline Strong** (`hairline-*` / `hairline-strong-*`): 1px rules everywhere — panel borders, table row dividers, KPI seams, knob borders, the LensBar divider. The strong step draws table header rules, art-thumb borders, inputs (`--input`) and pinned-column seams.
- **Ledger Ink** (`ledger-ink-*`): primary text, the tooltip's fill, and bold figures inside the headline ledger rows. The dark theme's ink is parchment-coloured.
- **Ledger Ink 2** (`ledger-ink-2-*`): secondary text — section descriptions, headline ledger figures, nav links at rest, knob text, table secondary numerals, the H1's clause after the archetype name.
- **Ledger Ink 3** (`ledger-ink-3-*`): tertiary text — KPI captions, matrix column heads and low-N cells, bucket rows, notices, the shadcn `muted-foreground`.
- **Mana chips** (`chip-white`, `chip-blue`, `chip-black`, `chip-red`, `chip-green`, `chip-ink`): printed-cardboard pip colours that do not change between themes. They paint the pips, the WUBRG hairline under the header, and the mana-gradient placeholder when art is missing.

### Named Rules

**The Gold Is Structure Rule.** Gold marks where you are and what frames the data (eyebrows, active lens, frames, focus). It never encodes a measured value; a gold number is a defect.

**The One Polarity Rule.** Rose↔teal is the only value-carrying pair, with neutral grey as the midpoint. The pair is CVD-validated and is never swapped for red/green. Polarity tints only a win-rate figure whose interval clears 50% (and the matrix/chart fills); archetype names, labels and prose never wear a series colour.

**The Cardboard Rule.** Mana chip colours are theme-constant. They identify an archetype together with its rank number and card art; they are never borrowed as chart hues.

## Typography

**Display Font:** Newsreader (self-hosted through `next/font`, variable 200–800 with an optical-size axis; falls back to a metric-matched "Newsreader Fallback", then Optima, Candara, Segoe UI, system-ui)
**Body Font:** Avenir Next (with Avenir, Segoe UI, system-ui fallbacks)
**Label/Mono Font:** ui-monospace (SF Mono, Menlo, Consolas) with tabular figures

**Character:** A newspaper-rooted editorial serif for headings, a clean humanist sans for prose, and a plain system mono for every number. The display face is the one web font the site ships (so the masthead reads the same on Android and Windows as on a Mac); body and data stay system stacks. The pairing reads as a printed ledger rather than a dashboard. Weights are bold (700) for headings and names, semibold (600) for labels and controls, regular elsewhere.

### Hierarchy

- **Display** (700, `clamp(30px, 4.5vw, 44px)`, 1.08): the meta overview H1: the archetype name in bold followed by a regular-weight clause in secondary ink ("is the most-played deck."), balanced across lines. Secondary pages scale the same role down: archetype H1 `clamp(26px, 4vw, 38px)`, tournament/matrix/changes H1–H2 `clamp(24px, 4vw, 34px)`.
- **Headline** (700, 23px, ~1.2): section H2 ("Top of the field", "Matchup matrix") and the EmptyState title. The brand mark and decklist event names sit one step below at 22px.
- **Title** (700, 16.5px, 0.01em tracking): the archetype name on a deck tile. Archetype names in tables and lists use the body face at 13.5px semibold instead.
- **Body** (400, 15px, 1.5): base prose. The headline ledger under the H1 is a definition list at 13.5px in secondary ink — 11px tracked-uppercase labels in tertiary ink sharing one max-content column, figures in bold ink tabular mono with the 95% interval — capped at 64ch; explanatory paragraphs cap at 65ch. Dense surfaces (tables, lists, section descriptions, nav) run at 13.5px; controls at 13px.
- **Label** (600, 11.5px, 0.18em, uppercase, gold): the eyebrow above every headline. Sibling labels share the tracked-uppercase treatment in ink: table headers (600, 11px, 0.13em), KPI captions (11.5px, 0.14em), popover field labels (11px, wide tracking), badge text (700, 10.5px, 0.08em).
- **Data** (400, 13.5px, tabular-nums): every number — win rates, records, shares, counts, CIs, dates. Emphasis is 700 weight in the same face. The KPI figure is this face at 26px/600 with -0.01em tracking; table secondaries and intervals drop to 12.5–11.5px; matrix records, column heads and rank badges stop at 11px, the floor for functional text.

### Named Rules

**The Tabular Numbers Rule.** Any figure the reader might compare down a column is set in the mono face with tabular figures. Prose numbers inside a sentence may stay in the body face only when bolded as emphasis in a section description.

**The Headline Pattern Rule.** Every page opens with a gold eyebrow (format · window), a serif H1 that states the leading fact as a plain sentence, and a ledger of labelled figures with their 95% intervals. The headline never asserts what the interval cannot support: "edge", "winning" and "best" are not derived from point estimates. Every major section opens with eyebrow → serif H2 → one-line description in secondary ink.

## Layout

A single centred column, 1280px wide at most, with 20px side padding on phones and 28px from `md` (768px) up. The header (brand left, nav right, theme toggle) sits in the same column and is closed by the WUBRG hairline (2.5px gradient through the five chip colours, 85% opacity) directly beneath it. Main content ends with 96px of bottom padding.

Within the column, pages stack titled sections with generous vertical rhythm: the headline block sits 40px below the LensBar; subsequent sections open 56px apart on the overview and 40px on secondary pages; a section's panel follows its description by 16px (18px for the tile grid). Inside panels the working unit is 14px horizontal padding per table cell, 7px vertical; panel bodies take 20px; the EmptyState breathes at 32px/48px. Hairline grids (KPI triad, matrix) are built with a 1px or 2px gap over a `--line` background so the seams read as ruled lines.

The overview's headline block is a two-column grid at `md` (1.5fr text, 1fr KPI triad). The deck tile grid is `auto-fill` of columns at least 320px wide, 16px gaps. Decklists split into two columns at `md`. Tables pin their first two columns (rank at a fixed 58px, then name) when scrolling horizontally below `md`, with a 24px right-edge fade as the scroll affordance; the share and CI columns fold away below `md` and the interval moves under the win rate.

The matchup matrix has its own seam: the N×N grid renders only at or above 880px when the device also has a hover-capable fine pointer; otherwise the per-archetype matchup list (with inline CIs) is shown. Touch targets grow to 44px below `md` (knobs, nav rows, name links, toggles). KPI tiles compact their padding and caption at or below 420px.

### Named Rules

**The Matrix Seam Rule.** The seam at 880px + `hover: hover` + `pointer: fine` is written once (the `matrix` variant); surfaces only consume it. Phones and touch tablets never receive the grid.

**The Titled Section Rule.** No table, chart or grid appears without the eyebrow → headline → description stack above it. Density is permitted; untitled density is not.

## Elevation & Depth

The system is predominantly flat with tonal layering. Three paper tones carry depth — ground (`--bg`), surface (`--surface`) for panels, raised (`--raised`) for insets such as matrix cells and bar troughs — and 1px hairlines in `--line` or `--line-strong` do the structural separation. One ambient shadow token, `--shadow`, is used sparingly on raised card-like objects (deck tiles, data panels, the EmptyState) and is tuned per theme: faint umber in light, deep black in dark. Popovers and tooltips take the stock small shadow; the tooltip is an ink-filled card. The matrix hero is framed not by shadow but by a 1px notched gradient border running gold-soft → hairline-strong → gold-soft. Hover depth is a 3px lift on deck tiles and a 1.04 scale with a 1.5px gold ring on highlighted matrix cells.

### Shadow Vocabulary

- **Ledger ambient, light** (`box-shadow: 0 1px 0 rgba(41, 36, 24, 0.06), 0 10px 30px -18px rgba(41, 36, 24, 0.35)`): deck tiles, table/scatter panels, EmptyState, decklist notice.
- **Ledger ambient, dark** (`box-shadow: 0 1px 0 rgba(0, 0, 0, 0.3), 0 16px 44px -20px rgba(0, 0, 0, 0.75)`): the same objects in Arena bronze.
- **Art scrim** (`inset 0 -34px 30px -20px rgba(10, 8, 4, 0.66)`): the bottom shade over deck tile art so pips and the tile edge read over bright plates.

### Named Rules

**The Hairline First Rule.** Separate with a 1px rule or a tonal step before reaching for a shadow. The ambient shadow belongs only to objects that are themselves cards or panels; it never appears on controls, chips or rows.

## Shapes

Cards are round, chrome is cut. The radius scale starts at zero: the shadcn `--radius` is 0px and every `rounded-*` utility resolves to a sharp corner, so panels, knobs, chips, badges, inputs, popovers, toasts and tooltips are all square-edged. Card-like objects opt back in explicitly: the deck tile (12px), the ArtCrop plate (8px by default), the table art thumb (4px), and anything that is a dot — mana pips, rank badges, matrix column heads, spinner — is fully circular. Two notched clip-paths cut chrome instead of rounding it: the LensBar and EmptyState use 14px corner cuts on the top-left and bottom-right; the matrix hero frame uses 18px cuts. Borders are 1px hairlines; the mirror cell of the matrix is a dashed hairline on a transparent ground. Mana pips carry a tiny inset bevel (`inset -1px -1.5px 0 rgba(0,0,0,.28)`) so they read as printed cardboard rather than flat discs.

### Named Rules

**The Round Cards, Cut Chrome Rule.** Radius is reserved for objects that depict cards or dots. Interface chrome stays sharp; where chrome needs emphasis it is notched, never rounded.

## Components

The component library is small and consistent: a notched toolbar of outlined knobs, gold-filled active chips, hairline panels, and a few signature data objects. The shadcn primitives in use (popover, tooltip, tabs, select, collapsible, sonner) inherit the Ledger palette through the semantic aliases; the copied `button`, `badge` and `card` files are present but unused.

### Buttons & Knobs

- **Shape:** sharp (0px), 1px hairline border.
- **Knob (default control):** transparent fill, secondary ink text at 13px with 0.02em tracking, 5px × 12px padding; ≥44px tall with 16px side padding below `md`. Used for every LensBar control and the window/knobs popover triggers.
- **Hover / Focus:** border steps to hairline-strong and text to primary ink (colour transition, ~150ms); focus is a 2px gold outline offset 2px. Disabled drops to 50% opacity.
- **Active chip:** gold fill, gold border, ground-coloured text, semibold — the pressed format chip. Hover keeps the ground text.
- **Gold CTA:** transparent fill, gold text, gold-soft border; hover washes the background in gold-wash. Used for Share this view, "Widen the window", and the archetype-adder chips.
- **Icon buttons:** 44px square hairline buttons (32px at `md`) for the theme and menu toggles, same hover/focus as the knob.

### Chips & Badges

- **Tier badge:** gold text on a gold-soft hairline, 10.5px bold, 0.08em tracking, 2px × 8px — next to an archetype H1 and on recent-deck rows.
- **Bucket badge:** tertiary ink on a hairline-strong border, same metrics, uppercase label (UNKNOWN / CONFLICT); the row it sits in is set at 70% opacity.
- **Mana pips:** 15px discs by default (17px on tiles and archetype headers, 14px in the matrix), 3px gap, canonical WUBRG order, theme-constant chip colours with an inset bevel; no letter glyphs.

### Cards / Containers

- **Panel:** surface fill, 1px hairline border, ambient shadow, sharp corners; wraps tables, the scatter and the matchup list. Table headers are tracked uppercase on a hairline-strong rule; rows divide with hairlines and wash gold on hover.
- **LensBar:** surface fill, hairline border, 14px notch, 14px × 12px padding, flex-wrapped knobs with a 1px vertical divider; Share rides right in the first row.
- **EmptyState:** same panel treatment with a 14px notch, centred, 32px × 48px padding, eyebrow → headline → message → gold CTA.
- **Matrix hero frame:** 1px notched (18px) gradient border around a surface panel with 20px padding.

### Inputs / Fields

- **Style:** 1px hairline border, ground (`--bg`) fill, mono at 16px (the iOS zoom floor), primary ink, sharp corners, 4px × 8px padding; labelled by an 11px tracked uppercase caption in tertiary ink.
- **Focus:** 2px gold outline, 1px offset.

### Navigation

- **Brand:** "MetaMage" in the display face at 22px bold, "Mage" in gold.
- **Links:** 13.5px, 0.04em tracking, secondary ink, transparent 2px bottom border; hover to primary ink; active page is gold text on a gold underline; focus is the gold outline.
- **Mobile:** below `md` the brand, a 44px menu toggle and the theme toggle share one row; links open in a collapsible list of 44px rows.
- **Hairline:** the WUBRG gradient rule closes the header in both shells.

### Deck Tile (signature)

A rounded card (12px) on surface with a border mixed from 34% gold into the hairline; art plate in a 626:457 frame over a raised ground, bottom scrim, a 24px circular rank badge top-left (dark translucent fill, parchment numeral, faint gold ring — fixed values that sit on art, not theme tokens), pips bottom-right (17px). Body row: name in the title face, then mono share and a bold mono win rate tinted by polarity. Hover lifts 3px and turns the border gold over 150ms ease-out.

### KPI Stat (signature)

Surface tiles joined by 1px `--line` seams inside a hairline border. Each tile: a 26px semibold mono figure over an 11.5px tracked uppercase caption in tertiary ink. Three tiles for the window totals. A tile whose value is a name rather than a figure (the event page's winner) sets it in the display face, bold, truncated: mono is for measurement.

### Matchup Matrix (signature)

A CSS grid (200px label column plus 54px-minimum cells, 2px gaps). Row headers: rank number, pips, name link (gold on hover), global win rate. Column heads: 19px tertiary-ink discs with the rank numeral. Cells are 48px tall, filled with `color-mix(in oklab, <pole> amt%, var(--raised))` where amt grows with |wr−50| (capped at 28 points) and with the reliability factor; cells under five games sit on plain raised with a dash; the mirror cell is a dashed hairline. Hover cross-highlights the row and column (scale 1.04, 1.5px gold ring); a tooltip in ink shows the record and 95% CI.

### Share Bar

A 14px raised trough with a gold-soft fill inset 2px and a 3px gold cap at its right end; mono percentage alongside.

### Tabs

The archetype page's tab row is a hairline rule with the active tab underlined in gold, the same treatment as the primary nav's active link: 13.5px triggers in secondary ink, 0.04em tracking, a 2px transparent bottom border that turns gold (with semibold text) when active, 44px tall below `md`. Every tab panel opens with the eyebrow → serif H2 → description stack.

### Pager

The page strip for long server-rendered lists (the event standings, 50 rows a page): a range line ("Players 51–100 of 1,491", tertiary ink with mono figures) and a row of knob-styled page links — hairline border, secondary ink, the current page as a gold-filled chip, Prev/Next at the ends (disabled at the edges at 50% opacity, never removed). Every page is a URL (`?page=n`), the current page carries `aria-current`.

### Feedback

- **Tooltip:** ink fill, ground-coloured text, 12px, 10px × 6px padding, 260px max width, sharp corners with a square arrow; 120ms delay, fade/zoom in.
- **Toast:** surface fill, gold-soft hairline, no radius; gold action button with ground text.
- **Spinner:** 28px ring, hairline track with a gold quarter, 0.8s linear spin, disabled under reduced motion, with a tracked uppercase caption "Consulting the ledger".
- **Low-sample notice:** 11.5px tertiary ink with a single 6px gold dot; the count in mono.

## Do's and Don'ts

### Do:

- **Do** open every page and section with the headline pattern: gold eyebrow (11.5px, 0.18em, uppercase) → Newsreader headline → one-line description in secondary ink.
- **Do** set every comparable number in the mono face with tabular figures, and tint a win rate teal or rose only when its interval clears 50%.
- **Do** keep chrome sharp (0px) and notch it (14px / 18px cuts) when it needs a frame; give radius only to card art (4–12px) and dots.
- **Do** separate with hairlines and tonal steps first; reserve the ambient `--shadow` for tiles and panels.
- **Do** carry the same rank number, pips and signature art for an archetype across tiles, table, scatter and matrix.
- **Do** keep sample size and uncertainty next to every figure: the interval under the win rate, the record under the matrix percentage, the low-sample notice when the window is thin.
- **Do** paint with the token pairs so both themes stay correct, and keep mana chip colours fixed across themes.

### Don't:

- **Don't** fall back to the stock shadcn / generic slate dashboard look: rounded pills, slate greys, blue primary, or the unused `Button` / `Badge` / `Card` primitives as shipped.
- **Don't** present a wall-of-table in the Goldfish / MTGTop8 manner — a dense grid with no eyebrow, headline or description above it.
- **Don't** use gold for any measured quantity, and don't swap the rose↔teal pair for red/green.
- **Don't** colour archetype names, labels or prose with a series or polarity colour.
- **Don't** render the N×N matrix on touch or below 880px; use the matchup list with inline CIs.
- **Don't** make colour the only signal: every polarity tint travels with a numeral, every pip row has a text label, every focus state has the gold outline.
