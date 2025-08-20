suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(forcats)
})

source("visualize/constants.R")

plot_tiers <- function(
  wr_df,
  title = "Tier Rankings",
  subtitle = NULL,
  caption = NULL
) {
  # Check required columns
  if (!all(c("archetype_name", "wr_lo", "tier") %in% names(wr_df))) {
    stop("Required columns (archetype_name, wr_lo, tier) must be present.")
  }

  # Define tier-specific colors
  tier_colors <- c(
    "0" = "#FF6B6B", # Bright red for Tier 0 (exceptional)
    "0.5" = "#FF8E53", # Orange-red for Tier 0.5 (very strong)
    "1" = "#4ECDC4", # Teal for Tier 1 (strong)
    "1.5" = "#45B7D1", # Blue for Tier 1.5 (average)
    "2" = "#96CEB4", # Light green for Tier 2 (below average)
    "2.5" = "#FECA57", # Yellow for Tier 2.5 (weak)
    "3" = "#A0A0A0" # Gray for Tier 3 (very weak)
  )

  # Prepare data
  df <- wr_df %>%
    filter(!is.na(wr_lo), !is.na(tier)) %>%
    arrange(desc(wr_lo)) %>%
    mutate(
      label = factor(archetype_name, levels = unique(archetype_name)),
      tier_label = case_when(
        tier == 0.0 ~ "Tier 0",
        tier == 0.5 ~ "Tier 0.5",
        tier == 1.0 ~ "Tier 1",
        tier == 1.5 ~ "Tier 1.5",
        tier == 2.0 ~ "Tier 2",
        tier == 2.5 ~ "Tier 2.5",
        tier == 3.0 ~ "Tier 3",
        TRUE ~ paste("Tier", tier)
      ),
      tier_color = tier_colors[as.character(tier)]
    )

  # Compute x-range with padding
  xmin <- min(df$wr_lo, na.rm = TRUE)
  xmax <- max(df$wr_lo, na.rm = TRUE)
  if (!is.finite(xmin) || !is.finite(xmax)) {
    xmin <- 0.4
    xmax <- 0.6
  }
  pad <- max(0.01, (xmax - xmin) * 0.05)
  xmin <- max(0, xmin - pad)
  xmax_original <- xmax
  xmax <- min(1, xmax + pad + 0.04) # Reduced space for text

  ggplot(df, aes(y = fct_rev(label))) +
    # Points colored by tier
    geom_point(
      aes(x = wr_lo, color = tier_color),
      size = 2.5,
      alpha = 0.8
    ) +
    # White background rectangles for text labels
    geom_rect(
      aes(
        xmin = xmax_original + 0.01,
        xmax = xmax,
        ymin = as.numeric(fct_rev(label)) - 0.4,
        ymax = as.numeric(fct_rev(label)) + 0.4
      ),
      fill = "white",
      color = NA
    ) +
    # Text labels on the right - wr_lo percentage
    geom_text(
      aes(
        x = xmax_original + 0.012,
        label = paste0(round(wr_lo * 100, 1), "%")
      ),
      hjust = 0,
      size = 1.6,
      family = "Inter",
      fontface = "bold",
      color = CHART_COLORS$text_primary
    ) +
    # Text labels on the right - tier label
    geom_text(
      aes(
        x = xmax_original + 0.022,
        label = tier_label,
        color = tier_color
      ),
      hjust = 0,
      nudge_x = 0.015,
      size = 1.6,
      family = "Inter",
      fontface = "bold"
    ) +
    scale_x_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(xmin, xmax),
      breaks = seq(
        ceiling(xmin * 20) / 20,
        floor(xmax_original * 20) / 20,
        by = 0.05
      ),
      expand = expansion(mult = c(0, 0.02))
    ) +
    scale_color_identity(guide = "none") +
    labs(
      title = title,
      subtitle = subtitle,
      caption = caption,
      x = "Lower Confidence Bound",
      y = NULL
    ) +
    theme_minimal(base_size = 12, base_family = "Inter") +
    theme(
      axis.text.y = element_text(size = 6, family = "Inter"),
      axis.text.x = element_text(size = 6, family = "Inter"),
      axis.title.x = element_text(size = 10, family = "Inter"),
      plot.title = element_text(
        size = 17,
        face = "bold",
        hjust = 0.5,
        family = "Inter"
      ),
      plot.subtitle = element_text(hjust = 0.5, size = 7, family = "Inter"),
      plot.caption = element_text(
        hjust = 0.4,
        size = 6,
        family = "Inter",
        color = CHART_COLORS$text_secondary
      ),
      panel.grid.major.y = element_line(
        color = CHART_COLORS$grid_light,
        linewidth = 0.3,
        linetype = "dotted"
      ),
      panel.grid.minor = element_blank(),
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(10, 15, 10, 10)
    ) +
    coord_cartesian(clip = "on")
}
