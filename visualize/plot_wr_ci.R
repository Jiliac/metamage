suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(forcats)
})

source("visualize/constants.R")

plot_wr_ci <- function(
  wr_df,
  color_map,
  order_levels,
  title = "Win Rates",
  subtitle = NULL,
  caption = NULL
) {
  df <- wr_df %>%
    mutate(name = factor(archetype_name, levels = order_levels)) %>%
    arrange(name) %>%
    mutate(
      label = name
    )

  # Sort by lower bound CI and create new factor levels
  df <- df %>%
    arrange(desc(wr_lo)) %>%
    mutate(
      label = factor(label, levels = unique(label))
    )

  # Color gradient based on actual lower bound CI values
  min_wr_lo <- min(df$wr_lo, na.rm = TRUE)
  max_wr_lo <- max(df$wr_lo, na.rm = TRUE)

  # Create color ramp function
  color_ramp <- grDevices::colorRampPalette(c(
    CHART_COLORS$gradient_cool,
    CHART_COLORS$gradient_warm
  ))

  # Map each wr_lo value to a color based on its position in the range
  df$line_col <- sapply(df$wr_lo, function(x) {
    if (is.na(x)) {
      return(CHART_COLORS$na_fallback)
    }
    prop <- (x - min_wr_lo) / (max_wr_lo - min_wr_lo)
    prop <- pmax(0, pmin(1, prop))
    color_ramp(100)[round(prop * 99) + 1]
  })

  # Compute x-range from data with minimal padding
  xmin <- suppressWarnings(min(df$wr_lo, na.rm = TRUE))
  xmax <- suppressWarnings(max(df$wr_hi, na.rm = TRUE))
  if (!is.finite(xmin) || !is.finite(xmax)) {
    xmin <- 0.4
    xmax <- 0.6
  }
  pad <- max(0.01, (xmax - xmin) * 0.02) # Reduced padding
  xmin <- max(0, xmin - pad)
  xmax <- min(1, xmax + pad) # Don't extend x-axis for labels

  # Create the plot
  p <- ggplot(df, aes(y = fct_rev(label))) +
    # CI whiskers as horizontal segments
    geom_segment(
      aes(x = wr_lo, xend = wr_hi, yend = fct_rev(label), color = line_col),
      linewidth = 0.4,
      lineend = "round"
    ) +
    # Point estimate
    geom_point(aes(x = wr, color = line_col), size = 1.2) +
    # 50% reference line
    geom_vline(
      xintercept = 0.5,
      linetype = "longdash",
      color = CHART_COLORS$reference_line,
      alpha = 0.6
    ) +
    scale_x_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(xmin, xmax),
      breaks = scales::pretty_breaks(n = 6),
      expand = expansion(mult = c(0, 0)) # No expansion
    ) +
    scale_color_identity(guide = "none") +
    labs(
      title = title,
      subtitle = subtitle,
      caption = caption,
      x = "Win Rate",
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
      # Adjust margins: top, right, bottom, left
      # Increase right margin significantly to make room for labels
      plot.margin = margin(10, 80, 10, 10) # Increased right margin from 30 to 80
    ) +
    coord_cartesian(clip = "off") # Allow drawing outside plot area

  # Add annotations for win rate labels outside the plot area
  # We'll add these as separate layers using annotation_custom
  for (i in 1:nrow(df)) {
    # Main WR percentage (bold)
    p <- p +
      annotation_custom(
        grob = grid::textGrob(
          label = paste0(round(df$wr[i] * 100, 1), "%"),
          x = 1.02, # Position relative to plot area (1 = right edge)
          y = 1 - (i - 0.5) / nrow(df), # Calculate y position
          hjust = 0,
          gp = grid::gpar(
            fontsize = 5,
            fontfamily = "Inter",
            fontface = "bold",
            col = CHART_COLORS$text_primary
          )
        )
      )

    # CI range (normal)
    p <- p +
      annotation_custom(
        grob = grid::textGrob(
          label = paste0(
            "(",
            round(df$wr_lo[i] * 100, 0),
            "–",
            round(df$wr_hi[i] * 100, 0),
            "%)"
          ),
          x = 1.12, # Further right for CI
          y = 1 - (i - 0.5) / nrow(df),
          hjust = 0,
          gp = grid::gpar(
            fontsize = 5,
            fontfamily = "Inter",
            col = "#606060"
          )
        )
      )
  }

  return(p)
}
