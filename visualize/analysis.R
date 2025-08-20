suppressPackageStartupMessages({
  library(dplyr)
})

#' Wilson confidence interval for proportions
#'
#' @param p proportion (wins + 0.5*draws)/games
#' @param n number of trials (games)
#' @param z z-score for confidence level (default 1.96 for 95%)
#' @return data frame with lo and hi columns
wilson_ci <- function(p, n, z = 1.96) {
  p <- as.numeric(p)
  n <- as.numeric(n)
  m <- length(p)

  lo <- rep(NA_real_, m)
  hi <- rep(NA_real_, m)

  ok <- !is.na(p) & !is.na(n) & n > 0
  if (any(ok)) {
    denom <- 1 + (z^2) / n[ok]
    center <- p[ok] + (z^2) / (2 * n[ok])
    margin <- z * sqrt((p[ok] * (1 - p[ok]) + (z^2) / (4 * n[ok])) / n[ok])
    lo[ok] <- pmax(0, pmin(1, (center - margin) / denom))
    hi[ok] <- pmax(0, pmin(1, (center + margin) / denom))
  }

  data.frame(lo = lo, hi = hi)
}

#' Add confidence intervals to win rate data
#'
#' @param df data frame with win rate data
#' @param p_col column name for proportion (default "wr")
#' @param n_col column name for number of games (default "games")
#' @return data frame with wr_lo and wr_hi columns added
add_ci <- function(df, p_col = "wr", n_col = "games") {
  if (nrow(df) == 0) {
    return(df)
  }
  ci <- wilson_ci(df[[p_col]], df[[n_col]])
  df$wr_lo <- ci$lo
  df$wr_hi <- ci$hi
  df
}

#' Add clustered (by player) confidence intervals for archetype win rates
#'
#' Uses cluster-robust SE (CR2) on per-player archetype win rates, with weights = games.
#' Falls back to Wilson CI when clustering is not possible (e.g., < 2 players).
#'
#' @param wr_df aggregated archetype WR data (columns: archetype_name, wr, games)
#' @param per_player_df per-player aggregated data
#'   (columns: archetype_name, player_id, wr, games)
#' @param level confidence level (default 0.95)
#' @return wr_df with wr_lo and wr_hi columns populated
add_ci_clustered <- function(wr_df, per_player_df, level = 0.95) {
  if (nrow(wr_df) == 0) {
    return(wr_df)
  }

  # Initialize
  wr_df$wr_lo <- NA_real_
  wr_df$wr_hi <- NA_real_

  for (i in seq_len(nrow(wr_df))) {
    arch <- wr_df$archetype_name[i]
    sub <- per_player_df %>%
      dplyr::filter(archetype_name == arch, is.finite(wr), !is.na(player_id))

    n_players <- dplyr::n_distinct(sub$player_id)
    total_games <- sum(sub$games %||% 0, na.rm = TRUE)

    if (n_players >= 2 && total_games > 0) {
      fit <- tryCatch(
        estimatr::lm_robust(
          wr ~ 1,
          data = sub,
          weights = games,
          clusters = player_id,
          se_type = "CR2"
        ),
        error = function(e) NULL
      )

      if (!is.null(fit)) {
        ci <- tryCatch(stats::confint(fit, level = level), error = function(e) {
          NULL
        })
        if (!is.null(ci)) {
          if (is.matrix(ci) && "(Intercept)" %in% rownames(ci)) {
            lo <- ci["(Intercept)", 1]
            hi <- ci["(Intercept)", 2]
          } else if (is.numeric(ci) && length(ci) == 2) {
            lo <- ci[1]
            hi <- ci[2]
          } else {
            lo <- NA_real_
            hi <- NA_real_
          }
          if (is.finite(lo)) {
            wr_df$wr_lo[i] <- max(0, min(1, lo))
          }
          if (is.finite(hi)) wr_df$wr_hi[i] <- max(0, min(1, hi))
        }
      }
    }
  }

  # Wilson fallback for any missing CI bounds
  need_fallback <- is.na(wr_df$wr_lo) | is.na(wr_df$wr_hi)
  if (any(need_fallback)) {
    ci_fb <- wilson_ci(wr_df$wr[need_fallback], wr_df$games[need_fallback])
    wr_df$wr_lo[need_fallback] <- ifelse(
      is.na(wr_df$wr_lo[need_fallback]),
      ci_fb$lo,
      wr_df$wr_lo[need_fallback]
    )
    wr_df$wr_hi[need_fallback] <- ifelse(
      is.na(wr_df$wr_hi[need_fallback]),
      ci_fb$hi,
      wr_df$wr_hi[need_fallback]
    )
  }

  wr_df
}

#' Filter archetypes by presence threshold and top N
#'
#' @param presence_df data frame with archetype presence data (must have share column)
#' @param top_n maximum number of archetypes to return
#' @param min_share minimum share threshold (default 0.01 for 1%)
#' @return filtered data frame with archetype names meeting criteria
filter_archetypes_by_presence <- function(
  presence_df,
  top_n,
  min_share = 0.01
) {
  presence_df %>%
    dplyr::filter(share > min_share) %>%
    dplyr::slice_head(n = top_n)
}

#' Filter archetypes by minimum matches and top N
#'
#' @param matchup_df data frame with matchup data (must have wins, losses columns)
#' @param top_n maximum number of archetypes to return
#' @param min_matches minimum total matches threshold (default 100)
#' @return vector of archetype names meeting criteria
filter_archetypes_by_matches <- function(matchup_df, top_n, min_matches = 100) {
  archetype_matches <- matchup_df %>%
    dplyr::group_by(row_archetype) %>%
    dplyr::summarise(
      total_matches = sum(wins + losses, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    dplyr::filter(total_matches > min_matches) %>%
    dplyr::arrange(dplyr::desc(total_matches)) %>%
    dplyr::slice_head(n = top_n)

  archetype_matches$row_archetype
}

#' Add tier rankings based on statistical analysis of confidence intervals
#'
#' Uses the lower bound of confidence intervals to assign tier rankings.
#' Tier boundaries are calculated using standard deviations from the mean of lower bounds.
#'
#' @param wr_df data frame with win rate data including wr_lo column
#' @return data frame with tier column added
add_tiers <- function(wr_df) {
  if (nrow(wr_df) == 0 || !"wr_lo" %in% colnames(wr_df)) {
    wr_df$tier <- NA_real_
    return(wr_df)
  }

  # Use lower bounds of confidence intervals for tier calculation
  lower_bounds <- wr_df$wr_lo[!is.na(wr_df$wr_lo)]

  if (length(lower_bounds) < 2) {
    wr_df$tier <- 1.5 # Default to average tier if insufficient data
    return(wr_df)
  }

  # Calculate mean and standard deviation of lower bounds
  mean_lb <- mean(lower_bounds, na.rm = TRUE)
  sd_lb <- sd(lower_bounds, na.rm = TRUE)

  # Define tier boundaries based on standard deviations from mean
  wr_df$tier <- dplyr::case_when(
    is.na(wr_df$wr_lo) ~ NA_real_,
    wr_df$wr_lo >= mean_lb + 3 * sd_lb ~ 0.0, # Tier 0: exceptional
    wr_df$wr_lo >= mean_lb + 2 * sd_lb ~ 0.5, # Tier 0.5: very strong
    wr_df$wr_lo >= mean_lb + 1 * sd_lb ~ 1.0, # Tier 1: strong
    wr_df$wr_lo >= mean_lb ~ 1.5, # Tier 1.5: average/playable
    wr_df$wr_lo >= mean_lb - 1 * sd_lb ~ 2.0, # Tier 2: below average
    wr_df$wr_lo >= mean_lb - 2 * sd_lb ~ 2.5, # Tier 2.5: weak
    TRUE ~ 3.0 # Tier 3: very weak
  )

  wr_df
}

#' Print tier rankings summary
#'
#' @param wr_df data frame with win rate data including tier column
print_tier_summary <- function(wr_df) {
  if (nrow(wr_df) == 0 || !"tier" %in% colnames(wr_df)) {
    message("No tier data available.")
    return(invisible())
  }

  message("Tier Rankings:")
  tier_summary <- wr_df %>%
    dplyr::select(archetype_name, wr, wr_lo, wr_hi, tier) %>%
    dplyr::arrange(tier, dplyr::desc(wr)) %>%
    dplyr::mutate(
      wr_pct = paste0(round(wr * 100, 1), "%"),
      ci_range = paste0(round(wr_lo * 100, 1), "-", round(wr_hi * 100, 1), "%"),
      tier_label = dplyr::case_when(
        tier == 0.0 ~ "Tier 0",
        tier == 0.5 ~ "Tier 0.5",
        tier == 1.0 ~ "Tier 1",
        tier == 1.5 ~ "Tier 1.5",
        tier == 2.0 ~ "Tier 2",
        tier == 2.5 ~ "Tier 2.5",
        tier == 3.0 ~ "Tier 3",
        TRUE ~ paste("Tier", tier)
      )
    )

  for (tier_val in sort(unique(tier_summary$tier))) {
    tier_archetypes <- tier_summary %>% dplyr::filter(tier == tier_val)
    tier_label <- tier_archetypes$tier_label[1]
    message(sprintf("%s:", tier_label))
    for (i in 1:nrow(tier_archetypes)) {
      arch <- tier_archetypes[i, ]
      message(sprintf(
        "  %s: %s (CI: %s)",
        arch$archetype_name,
        arch$wr_pct,
        arch$ci_range
      ))
    }
  }

  invisible()
}

# null-coalescing helper
`%||%` <- function(x, y) if (is.null(x)) y else x
