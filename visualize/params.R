# Visualization parameters for Meta Overview plots
# Override via environment variables:
#   MTG_FORMAT, START_DATE, END_DATE, TOP_N, OUTPUT_DIR, TOURNAMENT_DB_PATH

env_or <- function(var, default) {
  v <- Sys.getenv(var, unset = NA)
  if (is.na(v) || v == "") default else v
}

# Get values once
format_name <- env_or("MTG_FORMAT", "Standard")
start_date <- env_or("START_DATE", "2025-08-01")
end_date <- env_or("END_DATE", "2025-09-01")

# Build output directory path
start_year <- format(as.Date(start_date), "%Y")
start_md <- format(as.Date(start_date), "%m-%d")
end_md <- format(as.Date(end_date), "%m-%d")
output_dir <- file.path(
  "Results",
  format_name,
  start_year,
  paste0(start_md, "-", end_md)
)

params <- list(
  # Required analysis window
  format_name = format_name,
  start_date = start_date,
  end_date = end_date,

  # Selection and rendering
  top_n = as.integer(env_or("TOP_N", "20")),
  matrix_top_n = as.integer(env_or("MATRIX_TOP_N", "12")),
  output_dir = output_dir,
  db_path = env_or("TOURNAMENT_DB_PATH", "data/tournament.db"),

  # Export sizes (pixels) for 300 DPI-like raster
  overview_width = 2400,
  overview_height = 1400,

  # Panel exports
  matrix_width = 2800,
  matrix_height = 2400,
  bar_width = 1400,
  bar_height = 1200,
  presence_width = 1400,
  presence_height = 1400,
  bubble_width = 1000,
  bubble_height = 1000
)

# Derived output files
outputs <- list(
  meta_overview = file.path(params$output_dir, "meta_overview.png"),
  meta_matrix = file.path(params$output_dir, "meta_matrix.png"),
  meta_presence = file.path(params$output_dir, "meta_presence.png"),
  meta_wr_ci = file.path(params$output_dir, "meta_wr_ci.png"),
  meta_wr_presence = file.path(params$output_dir, "meta_wr_presence.png"),
  meta_tiers = file.path(params$output_dir, "meta_tiers.png")
)
