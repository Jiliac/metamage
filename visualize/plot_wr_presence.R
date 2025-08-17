suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(ggrepel)
})

source("visualize/constants.R")

plot_wr_vs_presence <- function(
  df,
  color_map,
  title = "Win Rate vs Presence",
  subtitle = NULL,
  caption = NULL
) {
  # Ensure CI columns exist
  if (!all(c("wr_lo", "wr_hi") %in% names(df))) {
    stop(
      "CI columns (wr_lo, wr_hi) must be present. Use add_ci() from analysis.R"
    )
  }

  # Color gradient based on lower bound CI values
  min_wr_lo <- min(df$wr_lo, na.rm = TRUE)
  max_wr_lo <- max(df$wr_lo, na.rm = TRUE)

  # Create color ramp function (green to orange like in WR chart)
  color_ramp <- grDevices::colorRampPalette(c(
    CHART_COLORS$gradient_cool,
    CHART_COLORS$gradient_warm
  ))

  # Map each wr_lo value to a color
  df$point_col <- sapply(df$wr_lo, function(x) {
    if (is.na(x)) {
      return(CHART_COLORS$na_fallback)
    } # gray for NA
    prop <- (x - min_wr_lo) / (max_wr_lo - min_wr_lo)
    prop <- pmax(0, pmin(1, prop)) # clamp to [0,1]
    color_ramp(100)[round(prop * 99) + 1]
  })

  # Compute y-range to minimize white space
  ymin <- min(df$wr, na.rm = TRUE)
  ymax <- max(df$wr, na.rm = TRUE)
  ypad <- (ymax - ymin) * 0.08

  # Label top 7 by lower bound win rate AND top 5 by presence
  top_7_wr <- df %>%
    arrange(desc(wr_lo)) %>%
    slice_head(n = 7) %>%
    pull(archetype_name)

  top_5_presence <- df %>%
    arrange(desc(share)) %>%
    slice_head(n = 5) %>%
    pull(archetype_name)

  # Union of both sets
  labeled_archetypes <- union(top_7_wr, top_5_presence)

  df_labeled <- df %>%
    mutate(
      label_text = ifelse(
        archetype_name %in% labeled_archetypes,
        archetype_name,
        ""
      )
    )

  ggplot(
    df_labeled,
    aes(
      x = share,
      y = wr,
      color = point_col,
      label = label_text
    )
  ) +
    geom_point(size = 2.5, alpha = 0.9) +
    ggrepel::geom_text_repel(
      show.legend = FALSE,
      size = 1.5,
      family = "Inter",
      max.overlaps = Inf,
      segment.size = 0.15,
      segment.color = CHART_COLORS$segment_light,
      box.padding = 0.8,
      point.padding = 0.8,
      force = 5,
      force_pull = 1,
      min.segment.length = 0.02,
      max.time = 2,
      max.iter = 10000,
      seed = 42
    ) +
    scale_x_sqrt(
      labels = percent_format(accuracy = 1),
      expand = expansion(mult = c(0.02, 0.08))
    ) +
    scale_y_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(ymin - ypad, ymax + ypad),
      expand = expansion(mult = c(0.02, 0.02))
    ) +
    scale_color_identity(guide = "none") +
    geom_hline(
      yintercept = 0.5,
      linetype = "longdash",
      color = CHART_COLORS$reference_line,
      alpha = 0.6
    ) +
    labs(
      title = title,
      subtitle = subtitle,
      caption = caption,
      x = "Presence (%)",
      y = "Win Rate"
    ) +
    theme_minimal(base_size = 12, base_family = "Inter") +
    theme(
      axis.text.x = element_text(size = 6, family = "Inter"),
      axis.text.y = element_text(size = 6, family = "Inter"),
      axis.title.x = element_text(size = 10, family = "Inter"),
      axis.title.y = element_text(size = 10, family = "Inter"),
      plot.title = element_text(
        size = 14,
        face = "bold",
        hjust = 0.5,
        family = "Inter"
      ),
      plot.subtitle = element_text(hjust = 0.5, size = 7, family = "Inter"),
      plot.caption = element_text(
        hjust = 0.2,
        size = 5,
        family = "Inter",
        color = CHART_COLORS$text_secondary
      ),
      panel.grid.major = element_line(
        color = CHART_COLORS$grid_light,
        linewidth = 0.3
      ),
      panel.grid.minor = element_blank(),
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(10, 10, 10, 10)
    )
}
