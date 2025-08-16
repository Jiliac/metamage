# MTG Meta Visualization (ggplot2) — Design and R snippets

This document explains the set of graphs we’ll generate to summarize a format’s metagame in a Karsten-style, player-centric way. We intentionally include mirrors in win-rate calculations because the field a player faces includes mirrors.

Overview (single-figure or multi-panel):
1) Matchup matrix heatmap (A vs B win rates, includes mirrors)
2) Presence bar chart (meta share of archetypes)
3) Win rate per archetype with 95% CI (includes mirrors)
4) Win rate vs Presence bubble chart (“power vs. presence” snapshot)

All plots use consistent colors per archetype and the same date window and format.

Data assumptions
- Schema: tournaments, tournament_entries, archetypes, matches, cards (see docs/schema.mmd).
- matches.result ∈ {WIN, LOSS, DRAW}; matches.mirror boolean; matches.pair_id groups both sides of a pairing.
- “Presence” is entry share (entries for archetype / total entries in window).
- “Win rate” treats DRAW as 0.5; mirrors are included by default in this guide.

Notes on mirrors (why include)
- Player-centric metric: expected wins at a tournament include mirrors. The diagonal of the matrix (A vs A) is therefore 50% by definition.
- If you also want a “strength vs field (non-mirror)” view, compute both and label clearly; this guide uses “including mirrors” for headline stats.

R setup (minimal)
```r
# Packages
library(DBI); library(RSQLite)
library(dplyr); library(tidyr); library(forcats)
library(ggplot2); library(scales); library(ggrepel); library(patchwork)

# Connect to SQLite (adjust path if needed)
con <- dbConnect(RSQLite::SQLite(), "data/tournament.db")

# Parameters
format_id  <- "<format-uuid>"     # or look up by name (see below)
start_date <- "2025-01-01"
end_date   <- "2025-12-31"
top_n      <- 15                  # number of archetypes to highlight; rest collapse to "Other"

# Helper: color palette per archetype (stable, colorblind-friendly)
palette_archetypes <- function(n) scales::hue_pal(l = 65, c = 100)(n)

# Optional: find a format_id by name (case-insensitive)
# dbGetQuery(con, "SELECT id, name FROM formats WHERE lower(name) = lower(?)", params = list("Standard"))
```

## Shared aggregates (presence + win rates, includes mirrors)
```r
# Presence (entries per archetype in window)
presence <- dbGetQuery(con, "
  SELECT a.name AS archetype, COUNT(*) AS entries
  FROM tournament_entries te
  JOIN tournaments t ON t.id = te.tournament_id
  JOIN archetypes a ON a.id = te.archetype_id
  WHERE t.format_id = ? AND date(t.date) BETWEEN date(?) AND date(?)
  GROUP BY a.name
", params = list(format_id, start_date, end_date)) |>
  mutate(entries = as.integer(entries)) |>
  arrange(desc(entries)) |>
  mutate(share = entries / sum(entries))

# Pick top N and collapse the rest to 'Other'
top_names <- presence$archetype[seq_len(min(nrow(presence), top_n))]
presence_top <- presence |>
  mutate(archetype = ifelse(archetype %in% top_names, archetype, "Other")) |>
  group_by(archetype) |>
  summarise(entries = sum(entries), .groups = "drop") |>
  mutate(share = entries / sum(entries)) |>
  arrange(desc(share))

# Win/loss/draw totals per archetype (from the player's side; includes mirrors)
wr_raw <- dbGetQuery(con, "
  SELECT a.name AS archetype,
         SUM(CASE WHEN m.result = 'WIN'  THEN 1 ELSE 0 END)  AS wins,
         SUM(CASE WHEN m.result = 'LOSS' THEN 1 ELSE 0 END)  AS losses,
         SUM(CASE WHEN m.result = 'DRAW' THEN 1 ELSE 0 END)  AS draws
  FROM matches m
  JOIN tournament_entries e ON e.id = m.entry_id
  JOIN tournaments t ON t.id = e.tournament_id
  JOIN archetypes a ON a.id = e.archetype_id
  WHERE t.format_id = ? AND date(t.date) BETWEEN date(?) AND date(?)
  GROUP BY a.name
", params = list(format_id, start_date, end_date)) |>
  mutate(wins = as.integer(wins), losses = as.integer(losses), draws = as.integer(draws)) |>
  mutate(games = wins + losses + draws,
         points = wins + 0.5 * draws,
         wr = ifelse(games > 0, points / games, NA_real_))

# Simple 95% CI for WR treating draws as 0.5 (normal approx; fine when draws are rare)
z <- qnorm(0.975)
wr_ci <- wr_raw |>
  mutate(se = sqrt(pmax(wr * (1 - wr), 0) / pmax(games, 1)),
         wr_lo = pmax(0, wr - z * se),
         wr_hi = pmin(1, wr + z * se))

# Join presence + WR; keep 'Other' if desired
summary_df <- presence_top |>
  select(archetype, entries, share) |>
  left_join(wr_ci, by = "archetype") |>
  arrange(desc(share)) |>
  mutate(archetype = fct_reorder(archetype, share))
```

## 1) Matchup matrix heatmap (includes mirrors)
- Meaning: each cell (row A, col B) is A’s win rate vs B, counting DRAW as 0.5. Diagonal (A vs A) is 50% by definition.
- Use only the player’s side of each match (m.entry_id) to avoid double-counting.
- Limit to top N archetypes for readability.

```r
mu <- dbGetQuery(con, "
  SELECT a1.name AS a, a2.name AS b,
         SUM(CASE WHEN m.result='WIN'  THEN 1
                  WHEN m.result='DRAW' THEN 0.5
                  ELSE 0 END) AS pts,
         COUNT(*) AS g
  FROM matches m
  JOIN tournament_entries e1 ON e1.id = m.entry_id
  JOIN archetypes a1 ON a1.id = e1.archetype_id
  JOIN tournament_entries e2 ON e2.id = m.opponent_entry_id
  JOIN archetypes a2 ON a2.id = e2.archetype_id
  JOIN tournaments t ON t.id = e1.tournament_id
  WHERE t.format_id = ? AND date(t.date) BETWEEN date(?) AND date(?)
  GROUP BY a1.name, a2.name
", params = list(format_id, start_date, end_date)) |>
  mutate(wr = ifelse(g > 0, pts / g, NA_real_))

# Keep top N on both axes; compute counts for labeling
mu_top <- mu |>
  filter(a %in% top_names, b %in% top_names) |>
  mutate(a = factor(a, levels = top_names),
         b = factor(b, levels = top_names))

p_matrix <- ggplot(mu_top, aes(a, b, fill = wr)) +
  geom_tile(color = "white") +
  geom_text(aes(label = ifelse(is.na(wr), "",
                               scales::percent(wr, accuracy = 1))),
            size = 3) +
  scale_fill_gradient2(
    low = "#d7191c", mid = "white", high = "#1a9641", midpoint = 0.5,
    limits = c(0.35, 0.65), oob = scales::squish, labels = percent
  ) +
  coord_equal() +
  labs(title = "Matchup Matrix (rows vs columns, incl. mirrors)", x = "", y = "", fill = "WR") +
  theme_minimal(base_size = 11) +
  theme(axis.text.x = element_text(angle = 45, hjust = 1))
```

## 2) Presence bar chart
- Horizontal bars, sorted by share; annotate with % and N.
```r
pal <- setNames(palette_archetypes(nrow(presence_top)), levels(summary_df$archetype))

p_presence <- ggplot(summary_df, aes(x = fct_rev(archetype), y = share, fill = archetype)) +
  geom_col(width = 0.7) +
  geom_text(aes(label = paste0(scales::percent(share, accuracy = 0.1), " (n=", entries, ")")),
            hjust = -0.05, size = 3.2) +
  scale_y_continuous(labels = percent_format(), expand = expansion(mult = c(0, 0.1))) +
  scale_fill_manual(values = pal, guide = "none") +
  coord_flip() +
  labs(title = "Archetype Presence (entries share)", x = "", y = "Share") +
  theme_minimal(base_size = 11)
```

## 3) Archetype win rate with 95% CI (includes mirrors)
- Bars with error bars; sort by WR; label WR and games.
- CI uses normal approximation on points-per-game; for high-draw formats consider a bootstrap CI.
```r
wr_plot_df <- summary_df |>
  filter(!is.na(wr)) |>
  mutate(archetype = fct_reorder(archetype, wr))

p_wr_ci <- ggplot(wr_plot_df, aes(x = fct_rev(archetype), y = wr, fill = archetype)) +
  geom_col(width = 0.7, alpha = 0.9) +
  geom_errorbar(aes(ymin = wr_lo, ymax = wr_hi), width = 0.2) +
  geom_text(aes(label = paste0(scales::percent(wr, accuracy = 0.1), " (g=", games, ")")),
            hjust = -0.05, size = 3.2) +
  scale_y_continuous(labels = percent_format(), limits = c(0.4, 0.6), expand = expansion(mult = c(0, 0.1))) +
  scale_fill_manual(values = pal, guide = "none") +
  coord_flip() +
  labs(title = "Archetype Win Rate (incl. mirrors) with 95% CI", x = "", y = "Win rate") +
  theme_minimal(base_size = 11)
```

## 4) Win rate vs Presence bubble chart
- x = WR (incl. mirrors), y = share, size = entries, color by archetype.
- Reference lines at 50% WR and median share; label archetypes.
```r
p_wr_vs_share <- ggplot(summary_df, aes(x = wr, y = share, size = entries, color = archetype, label = archetype)) +
  geom_hline(yintercept = median(summary_df$share), linetype = 3, color = "grey60") +
  geom_vline(xintercept = 0.5, linetype = 3, color = "grey60") +
  geom_point(alpha = 0.85) +
  ggrepel::geom_text_repel(size = 3, max.overlaps = 25, seed = 1, box.padding = 0.3) +
  scale_x_continuous(labels = percent_format()) +
  scale_y_continuous(labels = percent_format()) +
  scale_color_manual(values = pal, guide = "none") +
  scale_size_area(max_size = 12, guide = "none") +
  labs(title = "Snapshot: Win Rate vs Presence (incl. mirrors)", x = "Win rate", y = "Presence") +
  theme_minimal(base_size = 11)
```

Compose into one figure (optional)
```r
# Matrix is large; stack the three summaries to the right
layout <- "
AB
CB
DB
"
combined <- p_matrix + (p_presence / p_wr_ci / p_wr_vs_share) + plot_layout(design = layout)
# Save
ggsave("docs/meta_overview.png", combined, width = 14, height = 9, dpi = 200)
```

Quality controls and tips
- Top N + Other: keep the plot readable; you can vary `top_n` (10–20 common).
- Small samples: annotate counts (g for matchups; n for presence). Optionally dim cells with g < 5.
- Consistency: use one color per archetype across plots.
- Tournaments filter: consider excluding very small events (e.g., < 16 players) for stability.
- Time windows: the above is a snapshot; add a weekly trend view if desired (not shown here).
- Non-mirror variant: to show both perspectives, add `WHERE m.mirror = 0` to the WR query and label the plot accordingly.

FAQ
- Why is the A–A diagonal 50%? Because mirrors are symmetric; the value is informative mainly as a check.
- Should I include draws? Yes; they are rare but counting as 0.5 reflects expected points. If draws are frequent, prefer a bootstrap CI.

License and reproducibility
- These snippets assume `data/tournament.db` (see src/models/base.py for path). Adjust as needed.
- Output artifacts (e.g., docs/meta_overview.png) are safe to commit.

---

Card Report — presence and performance of individual cards (incl. mirrors)
Goal: a single figure summarizing which cards define the meta and how they perform. This is correlation, not causation: strong cards tend to appear in strong archetypes.

Parameters
```r
cards_top_n   <- 30          # how many cards to display
exclude_lands <- TRUE        # drop basic/land cards by default
board_filter  <- NULL        # NULL, "MAIN", or "SIDE"
```

SQL: card presence and WR (from the player’s side, counting a match if the player’s deck contains the card)
```r
card_df <- dbGetQuery(con, "
WITH entries AS (
  SELECT te.id
  FROM tournament_entries te
  JOIN tournaments t ON t.id = te.tournament_id
  WHERE t.format_id = ? AND date(t.date) BETWEEN date(?) AND date(?)
),
card_entries AS (
  SELECT DISTINCT dc.entry_id, dc.card_id
  FROM deck_cards dc
  JOIN entries e ON e.id = dc.entry_id
  JOIN cards c ON c.id = dc.card_id
  WHERE (? IS NULL OR dc.board = ?)
    AND (? = 0 OR c.is_land = 0)
),
counts AS (
  SELECT ce.card_id, COUNT(*) AS entries_with_card
  FROM card_entries ce
  GROUP BY ce.card_id
),
totals AS (
  SELECT COUNT(*) AS total_entries FROM entries
),
wr AS (
  SELECT ce.card_id,
         SUM(CASE WHEN m.result='WIN'  THEN 1
                  WHEN m.result='DRAW' THEN 0.5
                  ELSE 0 END) AS pts,
         COUNT(*) AS g
  FROM matches m
  JOIN card_entries ce ON ce.entry_id = m.entry_id
  GROUP BY ce.card_id
)
SELECT c.name AS card,
       cnt.entries_with_card,
       1.0 * cnt.entries_with_card / (SELECT total_entries FROM totals) AS presence,
       COALESCE(wr.pts, 0) AS pts,
       COALESCE(wr.g, 0) AS g
FROM counts cnt
JOIN cards c ON c.id = cnt.card_id
LEFT JOIN wr ON wr.card_id = cnt.card_id
ORDER BY entries_with_card DESC
", params = list(format_id, start_date, end_date, board_filter, board_filter, as.integer(!exclude_lands))) |>
  mutate(wr = ifelse(g > 0, pts / g, NA_real_)) |>
  slice_head(n = cards_top_n)
```

Compute 95% CI and palette
```r
z <- qnorm(0.975)
card_df <- card_df |>
  mutate(se = sqrt(pmax(wr * (1 - wr), 0) / pmax(g, 1)),
         wr_lo = pmax(0, wr - z * se),
         wr_hi = pmin(1, wr + z * se),
         card  = forcats::fct_reorder(card, presence))
pal_cards <- setNames(palette_archetypes(nrow(card_df)), levels(card_df$card))
```

## 5) Card presence (entries share)
```r
p_card_presence <- ggplot(card_df, aes(x = fct_rev(card), y = presence, fill = card)) +
  geom_col(width = 0.7) +
  geom_text(aes(label = paste0(scales::percent(presence, accuracy = 0.1),
                               " (n=", entries_with_card, ")")),
            hjust = -0.05, size = 3.0) +
  scale_y_continuous(labels = scales::percent_format(), expand = expansion(mult = c(0, 0.1))) +
  scale_fill_manual(values = pal_cards, guide = "none") +
  coord_flip() +
  labs(title = "Card Presence", x = "", y = "Share of entries (window)") +
  theme_minimal(base_size = 11)
```