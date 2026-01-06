# Script to generate rolling_months.csv
# Weekly data (48 weeks) with 30-day rolling windows for 2025

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
  "lubridate"
))

suppressPackageStartupMessages({
  library(dplyr)
  library(tidyr)
  library(stringr)
  library(DBI)
  library(RSQLite)
  library(glue)
  library(lubridate)
})

# Load modules
source("visualize/params.R")
source("visualize/db.R")
source("visualize/utils.R")
source("visualize/analysis.R")

# Connect to database
con <- connect_db(params$db_path)
on.exit(DBI::dbDisconnect(con), add = TRUE)

format_id <- get_format_id(con, params$format_name)

# Generate 48 weekly windows for 2025
# Each window is 30 days ending on consecutive weeks
# Week 1 ends on 2025-02-04 (first week with 30 days of data from Jan 6)
# Week 48 ends on 2025-12-30

generate_windows <- function() {
  # Start from week 1 ending Feb 4, 2025
  first_end_date <- as.Date("2025-02-04")

  windows <- lapply(0:47, function(week_offset) {
    end_date <- first_end_date + weeks(week_offset)
    start_date <- end_date - days(29) # 30-day window
    list(
      week = week_offset + 1,
      start_date = as.character(start_date),
      end_date = as.character(end_date)
    )
  })

  windows
}

windows <- generate_windows()

# Process each window
process_window <- function(window) {
  start_date <- window$start_date
  end_date <- window$end_date
  week_num <- window$week

  message(sprintf(
    "Processing week %d: %s to %s",
    week_num,
    start_date,
    end_date
  ))

  # Fetch presence data
  presence <- fetch_presence(con, format_id, start_date, end_date)

  # Fetch win rate data
  wr <- fetch_wr_by_archetype(con, format_id, start_date, end_date)

  # Fetch per-player data for clustered CI
  wr_by_player <- fetch_wr_by_archetype_player(
    con,
    format_id,
    start_date,
    end_date
  )

  # Add clustered confidence intervals
  CI_LEVEL <- 0.95
  wr <- add_ci_clustered(wr, wr_by_player, CI_LEVEL)

  # Get distinct player counts per archetype
  sql_players <- glue::glue_sql(
    "
    SELECT a.name AS archetype_name,
           COUNT(DISTINCT p.id) AS players
    FROM tournaments t
    JOIN tournament_entries e ON e.tournament_id = t.id
    JOIN archetypes a ON a.id = e.archetype_id
    JOIN players p ON p.id = e.player_id
    WHERE t.format_id = {format_id}
      AND t.date >= {start_date}
      AND t.date <= {end_date}
    GROUP BY a.name;
    ",
    .con = con
  )

  players_data <- DBI::dbGetQuery(con, sql_players) %>%
    mutate(
      archetype_name = stringr::str_to_title(archetype_name),
      players = as.integer(players)
    )

  # Merge all data together (NO archetype grouping)
  week_data <- presence %>%
    left_join(wr, by = "archetype_name") %>%
    left_join(players_data, by = "archetype_name") %>%
    mutate(
      # Handle missing data
      wins = ifelse(is.na(wins), 0L, wins),
      losses = ifelse(is.na(losses), 0L, losses),
      draws = ifelse(is.na(draws), 0L, draws),
      games = ifelse(is.na(games), 0L, games),
      players = ifelse(is.na(players), 0L, players),
      wr = ifelse(is.na(wr), 0, wr),
      wr_lo = ifelse(is.na(wr_lo), 0, wr_lo),
      wr_hi = ifelse(is.na(wr_hi), 0, wr_hi),

      # Create CSV columns
      start_date = start_date,
      end_date = end_date,
      Archetype = archetype_name,
      Wins = wins,
      Defeats = losses,
      Draws = draws,
      Copies = entries,
      Players = players,
      Matches = games,
      Presence = share * 100,
      Measured.Win.Rate = wr * 100,
      Lower.Bound.of.CI.on.WR = pmax(0, wr_lo) * 100,
      Upper.Bound.of.CI.on.WR = pmin(1, wr_hi) * 100
    ) %>%
    select(
      start_date,
      end_date,
      Archetype,
      Wins,
      Defeats,
      Draws,
      Copies,
      Players,
      Matches,
      Presence,
      Measured.Win.Rate,
      Lower.Bound.of.CI.on.WR,
      Upper.Bound.of.CI.on.WR
    ) %>%
    filter(Presence >= 0.5) %>%
    arrange(desc(Presence))

  week_data
}

# Process all windows and combine
all_data <- bind_rows(lapply(windows, process_window))

# Create data directory if it doesn't exist
if (!dir.exists("data")) {
  dir.create("data", recursive = TRUE)
}

# Write to CSV
write.csv(all_data, "data/rolling_months.csv", row.names = FALSE, quote = FALSE)

message(sprintf("\nGenerated rolling_months.csv"))
message(sprintf("Total rows: %d", nrow(all_data)))
message(sprintf("Weeks covered: %d", length(windows)))
message(sprintf("Format: %s", params$format_name))
message("Saved to: data/rolling_months.csv")
