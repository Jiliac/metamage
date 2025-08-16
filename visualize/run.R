# Runner to generate Meta Overview plots based on visualize/params.R

ensure_packages <- function(pkgs) {
  missing <- pkgs[!sapply(pkgs, requireNamespace, quietly = TRUE)]
  if (length(missing) > 0) {
    message("Installing missing R packages: ", paste(missing, collapse = ", "))
    install.packages(missing, repos = "https://cloud.r-project.org")
  }
}

ensure_packages(c(
  "DBI",
  "RSQLite",
  "glue",
  "dplyr",
  "tidyr",
  "stringr",
  "lubridate",
  "ggplot2",
  "scales",
  "ggrepel",
  "forcats",
  "tibble",
  "patchwork"
))

suppressPackageStartupMessages({
  library(dplyr)
  library(tidyr)
  library(stringr)
  library(tibble)
  library(ggplot2)
  library(scales)
  library(patchwork)
})

# Load modules
source("visualize/params.R")
source("visualize/db.R")
source("visualize/utils.R")
source("visualize/colors.R")
source("visualize/plots.R")

# Simple CLI override: key=value pairs
args <- commandArgs(trailingOnly = TRUE)
if (length(args) > 0) {
  for (a in args) {
    if (grepl("=", a, fixed = TRUE)) {
      kv <- strsplit(a, "=", fixed = TRUE)[[1]]
      key <- kv[1]
      val <- kv[2]
      if (key %in% names(params)) {
        message(sprintf("Overriding %s = %s", key, val))
        if (
          key %in%
            c(
              "top_n",
              "overview_width",
              "overview_height",
              "matrix_width",
              "matrix_height",
              "bar_width",
              "bar_height",
              "presence_width",
              "presence_height",
              "bubble_width",
              "bubble_height"
            )
        ) {
          params[[key]] <- as.integer(val)
        } else {
          params[[key]] <- val
        }
      }
    }
  }
}

ensure_dir(params$output_dir)

con <- connect_db(params$db_path)
on.exit(DBI::dbDisconnect(con), add = TRUE)

format_id <- get_format_id(con, params$format_name)

presence <- fetch_presence(con, format_id, params$start_date, params$end_date)

if (nrow(presence) == 0) {
  stop("No entries found for the selected window and format.")
}

top_order <- presence$archetype_name[seq_len(min(params$top_n, nrow(presence)))]
presence_top_other <- collapse_other(presence, params$top_n)

wr <- fetch_wr_by_archetype(
  con,
  format_id,
  params$start_date,
  params$end_date
) %>%
  filter(archetype_name %in% top_order) %>%
  add_ci()

# Merge WR with presence for bubble chart
wr_pres <- wr %>%
  inner_join(presence, by = c("archetype_name")) %>%
  select(
    archetype_name,
    wins,
    losses,
    draws,
    games,
    wr,
    wr_lo,
    wr_hi,
    entries,
    share
  )

# Matchups for just the top N archetypes
mat <- fetch_matchups(con, format_id, params$start_date, params$end_date) %>%
  filter(row_archetype %in% top_order, col_archetype %in% top_order)

# Ensure diagonal is explicitly set to 0.5 (visual anchor), even if NA
all_pairs <- tidyr::expand_grid(
  row_archetype = top_order,
  col_archetype = top_order
)
mat <- all_pairs %>%
  left_join(mat, by = c("row_archetype", "col_archetype")) %>%
  mutate(
    games = ifelse(is.na(games), 0L, games),
    wr = dplyr::case_when(
      row_archetype == col_archetype ~ 0.5,
      TRUE ~ wr
    )
  )

# Colors
color_map <- assign_archetype_colors(c(
  top_order,
  if ("Other" %in% presence_top_other$bucket) "Other"
))

# Build plots
p_presence <- plot_presence(
  presence_top_other,
  color_map,
  top_order,
  title = paste0(params$format_name, " Metagame Share"),
  subtitle = paste0(
    "From ",
    params$start_date,
    " to ",
    params$end_date,
    ", presence by matches"
  )
)
p_wr_ci <- plot_wr_ci(
  wr,
  color_map,
  top_order,
  title = paste0(params$format_name, " Win Rates"),
  subtitle = paste0(
    "95% confidence intervals, from ",
    params$start_date,
    " to ",
    params$end_date
  )
)
p_matrix <- plot_matrix(mat, color_map, top_order)
p_bubble <- plot_wr_vs_presence(wr_pres, color_map)

# Save outputs
ggsave(
  outputs$meta_matrix,
  p_matrix,
  width = params$matrix_width,
  height = params$matrix_height,
  units = "px",
  dpi = 300
)
ggsave(
  outputs$meta_presence,
  p_presence,
  width = params$presence_width,
  height = params$presence_height,
  units = "px",
  dpi = 300
)
ggsave(
  outputs$meta_wr_ci,
  p_wr_ci,
  width = params$bar_width,
  height = params$bar_height,
  units = "px",
  dpi = 300
)
ggsave(
  outputs$meta_wr_presence,
  p_bubble,
  width = params$bubble_width,
  height = params$bubble_height,
  units = "px",
  dpi = 300
)

message("Saved:")
message(" - ", outputs$meta_matrix)
message(" - ", outputs$meta_presence)
message(" - ", outputs$meta_wr_ci)
message(" - ", outputs$meta_wr_presence)
