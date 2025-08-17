suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(tidyr)
  library(forcats)
  library(stringr)
  library(ggrepel)
})

# Color constants for consistency across charts (excluding matrix)
CHART_COLORS <- list(
  # Primary gradient colors (warm to cool) - sophisticated palette
  gradient_warm = "#e15759", # Muted red for poor performance
  gradient_cool = "#4e79a7", # Dusty blue for good performance

  # Text colors
  text_primary = "#303030", # Dark gray for main text
  text_secondary = "#606060", # Medium gray for secondary text
  text_tertiary = "#6B7280", # Light gray for tertiary text

  # UI colors
  reference_line = "#60A5FA", # Blue for 50% reference line
  grid_light = "#F5F5F5", # Very light gray for grid lines
  segment_light = "#D0D0D0", # Light gray for segments/connectors

  # Special colors
  na_fallback = "#808080" # Gray for missing/NA values
)

plot_presence <- function(
  pres_df,
  color_map,
  order_levels,
  title = "Presence",
  subtitle = NULL,
  caption = NULL
) {
  df <- pres_df %>%
    mutate(
      name = factor(
        bucket,
        levels = c(order_levels, setdiff(bucket, order_levels))
      )
    ) %>%
    filter(bucket != "Other") %>% # drop the aggregated 'Other' row from the chart
    arrange(name) %>%
    mutate(
      label = name
    ) # Use archetype names as-is (already title cased from DB)

  # Assign warm-to-cold gradient colors in descending share order
  lvl <- levels(df$name)
  grad_cols <- grDevices::colorRampPalette(c(
    CHART_COLORS$gradient_warm,
    CHART_COLORS$gradient_cool
  ))(length(lvl))
  names(grad_cols) <- as.character(lvl)
  df$fill_col <- grad_cols[as.character(df$label)]

  xmax <- max(df$share, na.rm = TRUE)
  xmax <- ifelse(is.finite(xmax), xmax, 0.1)

  ggplot(df, aes(x = share, y = fct_rev(label), fill = fill_col)) +
    geom_col(width = 0.55, color = NA) +
    geom_text(
      aes(label = scales::percent(share, accuracy = 0.1)),
      hjust = -0.15,
      size = 2.5
    ) +
    scale_x_sqrt(
      labels = percent_format(accuracy = 1),
      limits = c(0, xmax * 1.12),
      expand = expansion(mult = c(0, 0.08))
    ) +
    scale_fill_identity(guide = "none") +
    labs(
      title = title,
      subtitle = subtitle,
      caption = caption,
      x = "Presence (%)",
      y = NULL
    ) +
    theme_minimal(base_size = 12, base_family = "Inter") +
    theme(
      axis.text.y = element_text(size = 6, family = "Inter"),
      axis.text.x = element_blank(),
      axis.title.x = element_text(size = 10, family = "Inter"),
      plot.title = element_text(
        size = 17,
        face = "bold",
        hjust = 0.5,
        family = "Inter"
      ),
      plot.subtitle = element_text(hjust = 0.5, size = 7, family = "Inter"),
      plot.caption = element_text(
        hjust = 0.3,
        size = 6,
        family = "Inter",
        color = CHART_COLORS$text_secondary
      ),
      panel.grid.major.y = element_blank(),
      panel.grid.major.x = element_blank(),
      panel.grid.minor = element_blank(),
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(10, 30, 10, 10)
    ) +
    coord_cartesian(clip = "off", expand = FALSE)
}

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
  pad <- max(0.01, (xmax - xmin) * 0.04)
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
    # Text labels on the right - main WR (bold)
    geom_text(
      aes(
        x = xmax_original + 0.015,
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
        x = xmax_original + 0.015,
        label = paste0(
          " (",
          round(wr_lo * 100, 1),
          "–",
          round(wr_hi * 100, 1),
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
    )
}

plot_matrix <- function(
  mat_df,
  color_map,
  order_levels,
  title = "Matchup Matrix",
  caption = NULL
) {
  # Prepare factors (reverse row order to put first archetype on top)
  df <- mat_df %>%
    mutate(
      row_name = factor(row_archetype, levels = rev(order_levels)),
      col_name = factor(col_archetype, levels = order_levels)
    )

  # Row summaries (exclude mirrors)
  row_sum <- df %>%
    filter(as.character(row_name) != as.character(col_name)) %>%
    group_by(row_name) %>%
    summarise(
      wins = sum(wins, na.rm = TRUE),
      losses = sum(losses, na.rm = TRUE),
      draws = sum(draws, na.rm = TRUE),
      games = sum(games, na.rm = TRUE),
      points = wins + 0.5 * draws,
      wr = ifelse(games > 0, points / games, NA_real_),
      .groups = "drop"
    )

  # Build x-axis with two left columns for row header and row WR summary
  col_levels <- levels(df$col_name)
  x_levels <- c("NAME", "WINRATE", col_levels)
  df$col_name2 <- factor(as.character(df$col_name), levels = x_levels)

  # Labels for the matrix cells and reliability (blank on mirrors; low-N special)
  df_cells <- df %>%
    mutate(
      is_mirror = as.character(row_name) == as.character(col_name),
      wr_plot = dplyr::if_else(is_mirror, NA_real_, wr),
      reliability = pmin(1, games / 50), # R = clamp(n/50, 0, 1)
      overlay_alpha = 1 - reliability, # white overlay alpha
      low_n = !is_mirror & games < 5, # very low sample

      # Calculate 95% CI for win rate (Wilson score interval approximation)
      points = wins + 0.5 * draws,
      p_hat = ifelse(games > 0, points / games, 0.5),
      z = 1.96, # 95% CI
      margin = ifelse(games > 0, z * sqrt(p_hat * (1 - p_hat) / games), 0),
      ci_low = pmax(0, p_hat - margin),
      ci_high = pmin(1, p_hat + margin),
      ci_crosses_50 = !is_mirror & games >= 5 & ci_low <= 0.5 & ci_high >= 0.5,

      # Two-tier CI indicators
      ci_crosses_45_55 = !is_mirror &
        games >= 5 &
        ci_low <= 0.55 &
        ci_high >= 0.45,

      ci_indicator = dplyr::case_when(
        is_mirror | low_n | games == 0 ~ "",
        ci_low > 0.5 ~ "▲", # Very favorable (CI entirely above 50%)
        ci_high < 0.5 ~ "▼", # Very unfavorable (CI entirely below 50%)
        ci_low > 0.40 & p_hat > 0.5 ~ "△", # Favorable (CI low > 45%, mean > 50%)
        ci_high < 0.60 & p_hat < 0.5 ~ "▽", # Unfavorable (CI high < 55%, mean < 50%)
        TRUE ~ "" # Not significant
      ),

      label_wr = dplyr::case_when(
        is_mirror ~ "",
        low_n ~ "–",
        is.na(wr) | games == 0 ~ "",
        TRUE ~ paste0(round(wr * 100, 0), "%", ci_indicator)
      ),
      label_n = dplyr::case_when(
        is_mirror ~ "",
        low_n ~ "",
        is.na(wr) | games == 0 ~ "",
        TRUE ~ paste0(wins, "-", losses)
      )
    )

  # Left-side header tiles: NAME and WR (with games under)
  name_tiles <- tibble::tibble(
    row_name = factor(rev(order_levels), levels = rev(order_levels)),
    col_name2 = factor("NAME", levels = x_levels),
    title = as.character(rev(order_levels)),
    label = stringr::str_wrap(as.character(rev(order_levels)), width = 16),
    subtitle = ""
  )

  wr_tiles <- tibble::tibble(
    row_name = factor(row_sum$row_name, levels = rev(order_levels)),
    col_name2 = factor("WINRATE", levels = x_levels),
    title = ifelse(
      is.na(row_sum$wr),
      "–",
      paste0(round(row_sum$wr * 100, 1), "%")
    ),
    subtitle = paste0(row_sum$wins, "-", row_sum$losses)
  )

  # Fill scale with tightened range to avoid saturated extremes
  fill_scale <- scale_fill_gradient2(
    low = "#F87171", # Lighter red
    mid = "#f0f0f0", # Sophisticated neutral
    high = "#4ADE80", # Lighter green
    midpoint = 0.5,
    limits = c(0.35, 0.65),
    oob = scales::squish,
    guide = "none"
  )

  # Create separate data for mirror, low-N, and regular non-mirror cells
  df_non_mirror <- df_cells %>% filter(!is_mirror)
  df_non_mirror_strong <- df_non_mirror %>% filter(!low_n)
  df_low_n <- df_non_mirror %>% filter(low_n)
  df_mirror <- df_cells %>% filter(is_mirror)

  ggplot() +
    # Non-mirror matrix cells (colored for regular, light grey for very low N)
    geom_tile(
      data = df_non_mirror_strong,
      aes(x = col_name2, y = row_name, fill = wr_plot),
      color = "#E5E7EB",
      size = 0.25
    ) +
    geom_tile(
      data = df_low_n,
      aes(x = col_name2, y = row_name),
      fill = "#F3F4F6",
      color = "#E5E7EB",
      size = 0.25
    ) +
    # Mirror cells (white background)
    geom_tile(
      data = df_mirror,
      aes(x = col_name2, y = row_name),
      fill = "white",
      color = "#E5E7EB",
      size = 0.25
    ) +
    # Reliability washout overlay for regular cells
    geom_tile(
      data = df_non_mirror_strong,
      aes(x = col_name2, y = row_name, alpha = overlay_alpha),
      fill = "white",
      color = NA
    ) +
    # Grey circles for mirror cells
    geom_point(
      data = df_mirror,
      aes(x = col_name2, y = row_name),
      color = "#D1D5DB",
      size = 4
    ) +
    # Win rate percentage (larger text) - only for non-mirror cells
    geom_text(
      data = df_non_mirror,
      aes(x = col_name2, y = row_name, label = label_wr),
      size = 2.6,
      family = "Inter",
      color = "#111827",
      fontface = "bold",
      nudge_y = 0.15
    ) +
    # Wins-losses record (smaller text) - only for non-mirror cells
    geom_text(
      data = df_non_mirror,
      aes(x = col_name2, y = row_name, label = label_n),
      size = 1.7,
      family = "Inter",
      color = "#6B7280",
      nudge_y = -0.15
    ) +
    # Left name column (no border)
    geom_tile(
      data = name_tiles,
      aes(x = col_name2, y = row_name),
      fill = "white",
      color = NA
    ) +
    geom_text(
      data = name_tiles,
      aes(x = col_name2, y = row_name, label = label),
      hjust = 1,
      nudge_x = 0.30,
      size = 2.8,
      family = "Inter",
      fontface = "bold",
      color = "#111827",
      lineheight = 0.92
    ) +
    # Left WR column (highlighted background with strong border)
    geom_tile(
      data = wr_tiles,
      aes(x = col_name2, y = row_name),
      fill = "#F8FAFC",
      color = "#374151",
      linewidth = 0.5
    ) +
    geom_text(
      data = wr_tiles,
      aes(x = col_name2, y = row_name, label = title),
      size = 2.6,
      family = "Inter",
      fontface = "bold",
      color = "#111827",
      nudge_y = 0.18
    ) +
    geom_text(
      data = wr_tiles,
      aes(x = col_name2, y = row_name, label = subtitle),
      size = 1.8,
      family = "Inter",
      color = "#6B7280",
      nudge_y = -0.2
    ) +
    fill_scale +
    scale_x_discrete(
      position = "top",
      limits = x_levels,
      labels = c("", "Winrate vs\nMetagame", col_levels)
    ) +
    scale_alpha_identity(guide = "none") +
    labs(
      title = title,
      caption = caption,
      x = NULL,
      y = NULL
    ) +
    theme_minimal(base_size = 12, base_family = "Inter") +
    theme(
      axis.text.x = element_text(
        angle = 30,
        hjust = 0,
        vjust = 0,
        size = 7,
        family = "Inter"
      ),
      axis.text.y = element_blank(),
      panel.grid = element_blank(),
      plot.title = element_text(
        size = 20,
        face = "bold",
        hjust = 0.5,
        family = "Inter",
        margin = margin(b = 20)
      ),
      plot.caption = element_text(
        hjust = 0.2,
        size = 9,
        family = "Inter",
        color = CHART_COLORS$text_secondary,
        margin = margin(t = 33)
      ),
      plot.background = element_rect(fill = "white", color = NA),
      panel.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(10, 10, 40, 20)
    ) +
    coord_fixed(ratio = 0.8, clip = "off") +
    # Add legend with white background box
    annotate(
      "label",
      x = max(as.numeric(factor(col_levels))) + 0.7,
      y = min(as.numeric(factor(rev(order_levels)))) - 0.5,
      label = "▲ Very favorable\n△ Favorable\n▽ Unfavorable\n▼ Very unfavorable",
      hjust = 0,
      vjust = 1.4,
      size = 2.8,
      family = "Inter",
      color = "#1F2937",
      fill = "white",
      label.padding = unit(0.3, "lines"),
      label.size = 0.25
    )
}

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
      force_pull = 2,
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
