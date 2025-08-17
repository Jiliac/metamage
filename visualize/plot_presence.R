suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(forcats)
})

source("visualize/constants.R")

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
