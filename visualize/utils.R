suppressPackageStartupMessages({
  library(dplyr)
  library(tidyr)
  library(stringr)
  library(forcats)
  library(tibble)
})


collapse_other <- function(presence_df, top_n) {
  top <- presence_df %>% slice_head(n = top_n)
  if (nrow(presence_df) <= top_n) {
    top$bucket <- top$archetype_name
    return(top)
  }
  other <- presence_df %>%
    slice(-(1:top_n)) %>%
    summarise(
      archetype_name = "Other",
      entries = sum(entries),
      share = sum(share)
    )
  bind_rows(top, other) %>% mutate(bucket = archetype_name)
}

ensure_dir <- function(path) {
  dir.create(path, recursive = TRUE, showWarnings = FALSE)
}

fmt_title_date <- function(start_date, end_date) {
  # Input ISO-8601 strings
  tryCatch(
    {
      s <- as.Date(start_date)
      e <- as.Date(end_date)
      if (!is.na(s) && !is.na(e)) {
        if (format(s, "%Y") == format(e, "%Y")) {
          paste0(format(s, "%b %Y"), " – ", format(e, "%b %Y"))
        } else {
          paste0(format(s, "%b %Y"), " – ", format(e, "%b %Y"))
        }
      } else {
        paste(start_date, "to", end_date)
      }
    },
    error = function(...) paste(start_date, "to", end_date)
  )
}
