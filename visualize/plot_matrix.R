suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(stringr)
  library(tibble)
})

source("visualize/constants.R")

plot_matrix <- function(
  mat_df,
  global_wr_df,
  presence_df,
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

  # Use global win rates (against ALL opponents, not just matrix opponents)
  row_sum <- global_wr_df %>%
    filter(archetype_name %in% order_levels) %>%
    mutate(row_name = factor(archetype_name, levels = rev(order_levels))) %>%
    select(row_name, wins, losses, draws, games, wr)

  # Join presence data
  row_presence <- presence_df %>%
    filter(archetype_name %in% order_levels) %>%
    mutate(row_name = factor(archetype_name, levels = rev(order_levels))) %>%
    select(row_name, entries, share)

  row_sum <- row_sum %>%
    left_join(row_presence, by = "row_name")

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

      # Create CI range label
      label_ci = dplyr::case_when(
        is_mirror ~ "",
        low_n ~ "",
        is.na(wr) | games == 0 ~ "",
        TRUE ~ paste0(round(ci_low * 100, 0), "-", round(ci_high * 100, 0), "%")
      ),

      label_wr = dplyr::case_when(
        is_mirror ~ "",
        low_n ~ "–",
        is.na(wr) | games == 0 ~ "",
        TRUE ~ paste0(round(wr * 100, 0), "%")
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
    subtitle = paste0(
      row_sum$entries,
      " matches (",
      round(row_sum$share * 100, 1),
      "%)"
    )
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
      color = NA,
      show.legend = TRUE
    ) +
    # Grey circles for mirror cells
    geom_point(
      data = df_mirror,
      aes(x = col_name2, y = row_name),
      color = "#D1D5DB",
      size = 4
    ) +
    # CI range (top, grey text) - only for non-mirror cells
    geom_text(
      data = df_non_mirror,
      aes(x = col_name2, y = row_name, label = label_ci),
      size = 1.6,
      family = "Inter",
      color = "#6B7280",
      nudge_y = 0.28
    ) +
    # Win rate percentage (middle, large bold) - only for non-mirror cells
    geom_text(
      data = df_non_mirror,
      aes(x = col_name2, y = row_name, label = label_wr),
      size = 2.9,
      family = "Inter",
      color = "#111827",
      fontface = "bold",
      nudge_y = 0
    ) +
    # Wins-losses record (bottom, grey text) - only for non-mirror cells
    geom_text(
      data = df_non_mirror,
      aes(x = col_name2, y = row_name, label = label_n),
      size = 1.7,
      family = "Inter",
      color = "#6B7280",
      nudge_y = -0.28
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
      size = 2.9,
      family = "Inter",
      fontface = "bold",
      color = "#111827",
      nudge_y = 0.15
    ) +
    geom_text(
      data = wr_tiles,
      aes(x = col_name2, y = row_name, label = subtitle),
      size = 1.2,
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
    scale_alpha_continuous(
      name = "Confidence (by matches)",
      limits = c(0, 1),
      breaks = c(0, 0.5, 1),
      labels = c("Low", "Medium", "High"),
      guide = guide_legend(
        title.position = "top",
        title.hjust = 0.5,
        direction = "horizontal",
        override.aes = list(
          fill = "#4ADE80",
          color = NA
        )
      )
    ) +
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
        size = 30,
        face = "bold",
        hjust = 0.55,
        family = "Inter",
        margin = margin(b = 10)
      ),
      plot.caption = element_text(
        hjust = 0.17,
        size = 9,
        family = "Inter",
        color = CHART_COLORS$text_secondary,
        margin = margin(t = -25)
      ),
      plot.background = element_rect(fill = "white", color = NA),
      panel.background = element_rect(fill = "white", color = NA),
      plot.margin = margin(10, 30, 10, 30),
      legend.position = "bottom",
      legend.justification = "right",
      legend.box.margin = margin(t = -7, r = 0, b = 0, l = 0),
      legend.title = element_text(size = 8, family = "Inter"),
      legend.text = element_text(size = 8, family = "Inter")
    ) +
    coord_fixed(ratio = 0.8, clip = "off")
}
