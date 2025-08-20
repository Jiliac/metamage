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

  ########################################################################
  # FILTER OUT ARCHETYPES WITH LOW CI BELOW 25% (0.25)
  # This removes archetypes that have poor win rates with high confidence
  ########################################################################
  # initial_count <- nrow(df)
  # filtered_archetypes <- df %>% filter(wr_lo < 0.25) %>% pull(archetype_name)
  #
  # cat("=====================")
  # if (length(filtered_archetypes) > 0) {
  #   cat(
  #     "Filtering out",
  #     length(filtered_archetypes),
  #     "archetypes with low CI below 25%:\n"
  #   )
  #   cat(paste(filtered_archetypes, collapse = ", "), "\n")
  # } else {
  #   cat("No archetypes filtered - all have low CI >= 25%\n")
  # }
  #
  # df <- df %>% filter(wr_lo >= 0.25)
  #
  # cat("Archetypes before filtering:", initial_count, "\n")
  # cat("Archetypes after filtering:", nrow(df), "\n")
  # cat("=====================")
  ########################################################################

  # CI columns should be added by caller using add_ci() from analysis.R

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
    } # gray for NA
    prop <- (x - min_wr_lo) / (max_wr_lo - min_wr_lo)
    prop <- pmax(0, pmin(1, prop)) # clamp to [0,1]
    color_ramp(100)[round(prop * 99) + 1]
  })

  # Compute x-range from data and add a little padding
  xmin <- suppressWarnings(min(df$wr_lo, na.rm = TRUE))
  xmax <- suppressWarnings(max(df$wr_hi, na.rm = TRUE))
  if (!is.finite(xmin) || !is.finite(xmax)) {
    xmin <- 0.4
    xmax <- 0.6
  }
  pad <- max(0.01, (xmax - xmin) * 0.05)
  xmin <- max(0, xmin - pad)
  xmax_original <- xmax
  xmax <- min(1, xmax + pad + 0.06) # Extra space for text

  ggplot(df, aes(y = fct_rev(label))) +
    # CI whiskers as horizontal segments
    geom_segment(
      aes(x = wr_lo, xend = wr_hi, yend = fct_rev(label), color = line_col),
      linewidth = 0.4,
      lineend = "round"
    ) +
    # Point estimate
    geom_point(aes(x = wr, color = line_col), size = 1.2) +
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
    # Text labels on the right - main WR (bold)
    geom_text(
      aes(
        x = xmax_original + 0.011,
        label = paste0(round(wr * 100, 1), "%")
      ),
      hjust = 0,
      size = 1.6,
      family = "Inter",
      fontface = "bold",
      color = CHART_COLORS$text_primary
    ) +
    # Text labels on the right - CI (normal)
    geom_text(
      aes(
        x = xmax_original + 0.02,
        label = paste0(
          "(",
          round(wr_lo * 100, 0),
          "–",
          round(wr_hi * 100, 0),
          "%)"
        )
      ),
      hjust = 0,
      nudge_x = 0.018,
      size = 1.6,
      family = "Inter",
      color = "#606060"
    ) +
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
      plot.margin = margin(10, 30, 10, 10)
    ) +
    coord_cartesian(clip = "on")
}
