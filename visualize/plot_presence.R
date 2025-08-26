suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
  library(dplyr)
  library(forcats)
})

source("visualize/constants.R")

# Custom piecewise transformation for presence charts
piecewise_compress_trans <- function(threshold = 0.10, compress_power = 0.3) {
  # Transform function
  transform_func <- function(x) {
    ifelse(
      x <= threshold,
      x, # Linear below threshold
      threshold + (x - threshold)^compress_power
    ) # Compressed above threshold
  }

  # Inverse transform function
  inverse_func <- function(y) {
    ifelse(
      y <= threshold,
      y, # Linear below threshold
      threshold + (y - threshold)^(1 / compress_power)
    ) # Inverse above threshold
  }

  # Create breaks function that handles the transformation
  breaks_func <- function(x) {
    # Get some reasonable breaks
    linear_breaks <- pretty(x[x <= threshold], n = 3)
    if (any(x > threshold)) {
      # Add a few breaks in the compressed region
      max_val <- max(x)
      compressed_breaks <- c(0.12, 0.15, max_val)
      compressed_breaks <- compressed_breaks[compressed_breaks <= max_val]
      all_breaks <- c(linear_breaks, compressed_breaks)
    } else {
      all_breaks <- linear_breaks
    }
    return(sort(unique(all_breaks)))
  }

  trans_new(
    name = "piecewise_compress",
    transform = transform_func,
    inverse = inverse_func,
    breaks = breaks_func,
    domain = c(0, Inf)
  )
}

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
    scale_x_continuous(
      trans = piecewise_compress_trans(threshold = 0.10, compress_power = 2),
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
        family = "Inter",
        margin = margin(b = 10)
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
