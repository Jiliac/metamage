suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(ggrepel)
  library(patchwork)
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

  # Create color ramp function (red=bad, green=good)
  color_ramp <- grDevices::colorRampPalette(c(
    CHART_COLORS$gradient_bad,
    CHART_COLORS$gradient_good
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

  # Rank decks by presence (#1 = most played). This index is shown inside each
  # dot and repeated in the side legend so the chart stays readable without
  # crowding every point with its full name.
  df <- df %>%
    arrange(desc(share)) %>%
    mutate(idx = row_number())

  # Compute y-range to minimize white space
  ymin <- min(df$wr, na.rm = TRUE)
  ymax <- max(df$wr, na.rm = TRUE)
  ypad <- (ymax - ymin) * 0.08

  # ---- Scatter panel: numbered dots ----------------------------------------
  dot_size <- 3
  num_size <- 1.4
  scatter <- ggplot(
    df,
    aes(x = share, y = wr)
  ) +
    geom_hline(
      yintercept = 0.5,
      linetype = "longdash",
      color = CHART_COLORS$reference_line,
      alpha = 0.6
    ) +
    geom_point(aes(color = point_col), size = dot_size, alpha = 0.9) +
    # Number centered exactly on each dot.
    geom_text(
      aes(label = idx),
      size = num_size,
      family = "Inter",
      fontface = "bold",
      color = CHART_COLORS$text_primary
    ) +
    scale_x_sqrt(
      labels = percent_format(accuracy = 1),
      expand = expansion(mult = c(0.04, 0.08))
    ) +
    scale_y_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(ymin - ypad, ymax + ypad),
      expand = expansion(mult = c(0.02, 0.02))
    ) +
    scale_color_identity(guide = "none") +
    labs(x = "Presence (%)", y = "Win Rate") +
    theme_minimal(base_size = 12, base_family = "Inter") +
    theme(
      axis.text.x = element_text(size = 6, family = "Inter"),
      axis.text.y = element_text(size = 6, family = "Inter"),
      axis.title.x = element_text(size = 10, family = "Inter"),
      axis.title.y = element_text(size = 10, family = "Inter"),
      panel.grid.major = element_line(
        color = CHART_COLORS$grid_light,
        linewidth = 0.3
      ),
      panel.grid.minor = element_blank(),
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(6, 10, 6, 4)
    )

  # ---- Legend panel: number + colored dot + deck name ----------------------
  legend_df <- df %>%
    mutate(y = -idx)

  legend <- ggplot(legend_df, aes(x = 0, y = y)) +
    geom_point(aes(color = point_col), size = dot_size, alpha = 0.9) +
    geom_text(
      aes(label = idx),
      size = num_size,
      family = "Inter",
      fontface = "bold",
      color = CHART_COLORS$text_primary
    ) +
    geom_text(
      aes(x = 0.35, label = archetype_name),
      hjust = 0,
      size = 2.1,
      family = "Inter",
      color = CHART_COLORS$text_primary
    ) +
    scale_color_identity(guide = "none") +
    scale_x_continuous(limits = c(-0.35, 4.5)) +
    scale_y_continuous(expand = expansion(mult = c(0.04, 0.04))) +
    theme_void(base_family = "Inter") +
    theme(
      plot.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(6, 0, 6, 8)
    )

  # ---- Compose: legend on the left, scatter on the right -------------------
  (legend + scatter) +
    plot_layout(widths = c(1, 2.2)) +
    plot_annotation(
      title = title,
      subtitle = subtitle,
      caption = caption,
      theme = theme(
        plot.title = element_text(
          size = 11.7,
          face = "bold",
          hjust = 0.5,
          family = "Inter"
        ),
        plot.subtitle = element_text(hjust = 0.5, size = 7, family = "Inter"),
        plot.caption = element_text(
          hjust = 0.5,
          size = 5,
          family = "Inter",
          color = CHART_COLORS$text_secondary
        ),
        plot.background = element_rect(fill = "white", color = NA)
      )
    )
}
