# Visualization parameters for Meta Overview plots
# Override via environment variables:
#   MTG_FORMAT, START_DATE, END_DATE, TOP_N, OUTPUT_DIR, TOURNAMENT_DB_PATH

env_or <- function(var, default) {
  v <- Sys.getenv(var, unset = NA)
  if (is.na(v) || v == "") default else v
}

params <- list(
  # Required analysis window
  format_name = env_or("MTG_FORMAT", "Modern"),
  start_date  = env_or("START_DATE", "2025-07-01"),
  end_date    = env_or("END_DATE",   "2025-08-15"),

  # Selection and rendering
  top_n       = as.integer(env_or("TOP_N", "20")),
  output_dir  = env_or("OUTPUT_DIR", "docs"),
  db_path     = env_or("TOURNAMENT_DB_PATH", "data/tournament.db"),

  # Export sizes (pixels) for 300 DPI-like raster
  overview_width  = 2400,
  overview_height = 1400,

  # Panel exports
  matrix_width    = 1800,
  matrix_height   = 1200,
  bar_width       = 1000,
  bar_height      = 1200,
  presence_width  = 2200,
  presence_height = 1400,
  bubble_width    = 1000,
  bubble_height   = 1000
)

# Derived output files
outputs <- list(
  meta_overview   = file.path(params$output_dir, "meta_overview.png"),
  meta_matrix     = file.path(params$output_dir, "meta_matrix.png"),
  meta_presence   = file.path(params$output_dir, "meta_presence.png"),
  meta_wr_ci      = file.path(params$output_dir, "meta_wr_ci.png"),
  meta_wr_presence= file.path(params$output_dir, "meta_wr_presence.png")
)
