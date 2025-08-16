suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(tidyr)
  library(forcats)
  library(ggrepel)
})

plot_presence <- function(pres_df, color_map, order_levels, title = "Presence") {
  df <- pres_df %>%
    mutate(name = factor(bucket, levels = c(order_levels, setdiff(bucket, order_levels)))) %>%
    arrange(name)

  # Highlight the top archetype, use a unified color for the rest
  top_name <- order_levels[1]
  default_col <- "#6271FF"
  highlight_col <- "#F24B5A"
  df$fill_col <- ifelse(df$bucket == top_name, highlight_col, default_col)

  xmax <- max(df$share, na.rm = TRUE)
  xmax <- ifelse(is.finite(xmax), xmax, 0.1)

  ggplot(df, aes(x = share, y = fct_rev(name), fill = fill_col)) +
    geom_col(width = 0.65, color = NA) +
    geom_text(
      aes(label = paste0("\u2013", scales::percent(share, accuracy = 0.1))),
      hjust = -0.1, size = 3.6
    ) +
    scale_x_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(0, xmax * 1.12),
      expand = expansion(mult = c(0, 0.08))
    ) +
    scale_fill_identity(guide = "none") +
    labs(
      title = title,
      x = "Presence (%)", y = NULL
    ) +
    theme_minimal(base_size = 12) +
    theme(
      axis.text.y = element_text(size = 11),
      axis.text.x = element_text(size = 10),
      plot.title = element_text(size = 20, face = "bold", hjust = 0.5),
      panel.grid.major.y = element_blank(),
      panel.grid.minor = element_blank(),
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(10, 30, 10, 10)
    ) +
    coord_cartesian(clip = "off")
}

plot_wr_ci <- function(wr_df, color_map, order_levels) {
  df <- wr_df %>%
    mutate(name = factor(archetype_name, levels = order_levels)) %>%
    arrange(name)

  ggplot(df, aes(x = wr, y = fct_rev(name), fill = name)) +
    geom_col(width = 0.65) +
    geom_errorbarh(aes(xmin = wr_lo, xmax = wr_hi), height = 0.2, color = "black", size = 0.3) +
    geom_text(aes(label = paste0(round(wr * 100, 1), "%")),
              hjust = -0.05, size = 3.2) +
    scale_x_continuous(
      labels = percent_format(accuracy = 1),
      limits = c(0.4, 0.6),
      breaks = seq(0.4, 0.6, 0.05),
      expand = expansion(mult = c(0, 0.12))
    ) +
    scale_fill_manual(values = color_map, guide = "none") +
    labs(
      title = "Win Rate (95% CI), mirrors included",
      x = NULL, y = NULL
    ) +
    theme_minimal(base_size = 11) +
    theme(
      panel.grid.major.y = element_blank(),
      panel.grid.minor = element_blank(),
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA)
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
      low = "#D73027", mid = "white", high = "#1A9850",
      midpoint = 0.5, limits = c(0.35, 0.65), oob = squish,
      guide = "none"
    ) +
    scale_x_discrete(position = "top") +
    labs(
      title = "Matchup Matrix (row vs column, mirrors included)",
      x = NULL, y = NULL
    ) +
    theme_minimal(base_size = 11) +
    theme(
      axis.text.x = element_text(angle = 40, hjust = 0, vjust = 0),
      panel.grid = element_blank()
    ) +
    coord_equal()
}

plot_wr_vs_presence <- function(df, color_map) {
  ggplot(df, aes(x = share, y = wr, color = archetype_name, label = archetype_name, size = entries)) +
    geom_point(alpha = 0.85) +
    ggrepel::geom_text_repel(show.legend = FALSE, size = 3, max.overlaps = 25, segment.size = 0.2) +
    scale_x_continuous(labels = percent_format(accuracy = 1)) +
    scale_y_continuous(labels = percent_format(accuracy = 1), limits = c(0.35, 0.65)) +
    scale_color_manual(values = color_map, guide = "none") +
    scale_size_area(max_size = 8, guide = "none") +
    geom_hline(yintercept = 0.5, linetype = "dashed", color = "gray50") +
    labs(
      title = "Win Rate vs Presence",
      x = "Presence", y = "Win Rate"
    ) +
    theme_minimal(base_size = 11) +
    theme(
      panel.background = element_rect(fill = "white", color = NA),
      plot.background = element_rect(fill = "white", color = NA)
    )
}
