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
