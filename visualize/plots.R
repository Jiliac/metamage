suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(tidyr)
  library(forcats)
  library(stringr)
  library(ggrepel)
})

plot_presence <- function(
  pres_df,
  color_map,
  order_levels,
  title = "Presence",
  subtitle = NULL
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
      label = stringr::str_to_title(as.character(name)),
      label = factor(label, levels = stringr::str_to_title(levels(name)))
    ) # Title Case labels with preserved order

  # Assign warm-to-cold gradient colors in descending share order
  lvl <- levels(df$name)
  grad_cols <- grDevices::colorRampPalette(c("#F59E0B", "#10B981"))(length(lvl))
  names(grad_cols) <- stringr::str_to_title(lvl)
  df$fill_col <- grad_cols[as.character(df$label)]

  xmax <- max(df$share, na.rm = TRUE)
  xmax <- ifelse(is.finite(xmax), xmax, 0.1)

  ggplot(df, aes(x = share, y = fct_rev(label), fill = fill_col)) +
    geom_col(width = 0.55, color = NA) +
    geom_text(
      aes(label = scales::percent(share, accuracy = 0.1)),
      hjust = -0.1,
      size = 3.6
    ) +
    scale_x_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(0, xmax * 1.12),
      expand = expansion(mult = c(0, 0.08))
    ) +
    scale_fill_identity(guide = "none") +
    labs(
      title = title,
      subtitle = subtitle,
      x = "Presence (%)",
      y = NULL
    ) +
    theme_minimal(base_size = 12, base_family = "Inter") +
    theme(
      axis.text.y = element_text(size = 7, family = "Inter"),
      axis.text.x = element_text(size = 10, family = "Inter"),
      plot.title = element_text(
        size = 20,
        face = "bold",
        hjust = 0.5,
        family = "Inter"
      ),
      plot.subtitle = element_text(hjust = 0.5, size = 7, family = "Inter"),
      panel.grid.major.y = element_blank(),
      panel.grid.minor = element_blank(),
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(10, 30, 10, 10)
    ) +
    coord_cartesian(clip = "off")
}

plot_wr_ci <- function(wr_df, color_map, order_levels, subtitle = NULL) {
  df <- wr_df %>%
    mutate(name = factor(archetype_name, levels = order_levels)) %>%
    arrange(name) %>%
    mutate(
      label = stringr::str_to_title(as.character(name)),
      label = factor(label, levels = stringr::str_to_title(levels(name)))
    )

  # Ensure CI columns exist (in case caller didn't add them)
  if (!all(c("wr_lo", "wr_hi") %in% names(df))) {
    ci <- wilson_ci(df$wr, df$games)
    df$wr_lo <- ci$lo
    df$wr_hi <- ci$hi
  }

  # Warm-to-cool gradient like the presence chart, mapped by ordered names
  lvl <- levels(df$name)
  grad_cols <- grDevices::colorRampPalette(c("#F59E0B", "#10B981"))(length(lvl))
  names(grad_cols) <- stringr::str_to_title(lvl)
  df$line_col <- grad_cols[as.character(df$label)]

  # Compute x-range from data and add a little padding
  xmin <- suppressWarnings(min(df$wr_lo, na.rm = TRUE))
  xmax <- suppressWarnings(max(df$wr_hi, na.rm = TRUE))
  if (!is.finite(xmin) || !is.finite(xmax)) {
    xmin <- 0.4
    xmax <- 0.6
  }
  pad <- max(0.02, (xmax - xmin) * 0.08)
  xmin <- max(0, xmin - pad)
  xmax <- min(1, xmax + pad)

  ggplot(df, aes(y = fct_rev(label))) +
    # CI whiskers as horizontal segments
    geom_segment(
      aes(x = wr_lo, xend = wr_hi, yend = fct_rev(label), color = line_col),
      size = 0.6,
      lineend = "round"
    ) +
    # Point estimate
    geom_point(aes(x = wr, color = line_col), size = 1.5) +
    # 50% reference line
    geom_vline(
      xintercept = 0.5,
      linetype = "longdash",
      color = "#60A5FA",
      alpha = 0.6
    ) +
    scale_x_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(xmin, xmax),
      expand = expansion(mult = c(0, 0.12))
    ) +
    scale_color_identity(guide = "none") +
    labs(
      title = "Win rates with 95% confidence intervals",
      subtitle = subtitle,
      x = "Win rate",
      y = NULL
    ) +
    theme_minimal(base_size = 12, base_family = "Inter") +
    theme(
      axis.text.y = element_text(size = 7, family = "Inter"),
      axis.text.x = element_text(size = 6, family = "Inter"),
      plot.title = element_text(
        size = 12,
        face = "bold",
        hjust = 0.5,
        family = "Inter"
      ),
      plot.subtitle = element_text(hjust = 0.5, size = 7, family = "Inter"),
      panel.grid.major.y = element_blank(),
      panel.grid.minor = element_blank(),
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(10, 30, 10, 10)
    )
}

plot_matrix <- function(mat_df, color_map, order_levels) {
  df <- mat_df %>%
    mutate(
      row_name = factor(row_archetype, levels = order_levels),
      col_name = factor(col_archetype, levels = order_levels)
    )

  ggplot(df, aes(x = col_name, y = row_name, fill = wr)) +
    geom_tile(color = "white", size = 0.2) +
    geom_text(
      aes(label = ifelse(is.na(wr), "", paste0(round(wr * 100, 0), "%"))),
      size = 2.8
    ) +
    scale_fill_gradient2(
      low = "#D73027",
      mid = "white",
      high = "#1A9850",
      midpoint = 0.5,
      limits = c(0.35, 0.65),
      oob = squish,
      guide = "none"
    ) +
    scale_x_discrete(position = "top") +
    labs(
      title = "Matchup Matrix (row vs column, mirrors included)",
      x = NULL,
      y = NULL
    ) +
    theme_minimal(base_size = 11) +
    theme(
      axis.text.x = element_text(angle = 40, hjust = 0, vjust = 0),
      panel.grid = element_blank()
    ) +
    coord_equal()
}

plot_wr_vs_presence <- function(df, color_map) {
  ggplot(
    df,
    aes(
      x = share,
      y = wr,
      color = archetype_name,
      label = archetype_name,
      size = entries
    )
  ) +
    geom_point(alpha = 0.85) +
    ggrepel::geom_text_repel(
      show.legend = FALSE,
      size = 3,
      max.overlaps = 25,
      segment.size = 0.2
    ) +
    scale_x_continuous(labels = percent_format(accuracy = 1)) +
    scale_y_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(0.35, 0.65)
    ) +
    scale_color_manual(values = color_map, guide = "none") +
    scale_size_area(max_size = 8, guide = "none") +
    geom_hline(yintercept = 0.5, linetype = "dashed", color = "gray50") +
    labs(
      title = "Win Rate vs Presence",
      x = "Presence",
      y = "Win Rate"
    ) +
    theme_minimal(base_size = 11) +
    theme(
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA)
    )
}
