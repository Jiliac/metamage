# Script to generate marav.csv export similar to docs/marav.csv
# This creates a comprehensive meta analysis report for the current window

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

# Fetch presence data
presence <- fetch_presence(con, format_id, params$start_date, params$end_date)

# Fetch win rate data
wr <- fetch_wr_by_archetype(con, format_id, params$start_date, params$end_date)

# Fetch per-player data for clustered CI
wr_by_player <- fetch_wr_by_archetype_player(
  con,
  format_id,
  params$start_date,
  params$end_date
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

# Merge all data together
marav_data <- presence %>%
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

    # Group related archetypes
    archetype_grouped = case_when(
      archetype_name %in% c("Esper Blink", "Mardu Blink", "Orzhov Blink") ~
        "Blink",
      archetype_name %in%
        c("Azorius Scam", "Azorius Control", "Jeskai Control") ~
        "Control",
      archetype_name %in% c("Ramp Eldrazi", "Aggro Eldrazi") ~ "Eldrazi",
      archetype_name %in% c("Dimir Frog", "Esper Frog") ~ "Frog",
      archetype_name %in% c("Mardu Energy", "Boros Energy") ~ "Energy",
      archetype_name %in% c("Grixis Reanimator", "Goryo Reanimator") ~
        "Reanimator",
      TRUE ~ archetype_name
    )
  ) %>%
  # Group by the new archetype names and sum the stats
  group_by(archetype_grouped) %>%
  summarise(
    wins = sum(wins, na.rm = TRUE),
    losses = sum(losses, na.rm = TRUE),
    draws = sum(draws, na.rm = TRUE),
    games = sum(games, na.rm = TRUE),
    entries = sum(entries, na.rm = TRUE),
    players = sum(players, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  mutate(
    # Recalculate derived stats
    share = entries / sum(entries),
    wr = ifelse(games > 0, wins / (wins + losses), 0),

    # Create CSV columns matching docs/marav.csv format
    Archetype = archetype_grouped,
    Wins = wins,
    Defeats = losses,
    Draws = draws,
    Copies = entries,
    Players = players,
    Matches = games,
    Presence = share * 100, # Convert to percentage
    Measured.Win.Rate = wr * 100, # Convert to percentage
    # Note: CI bounds will be recalculated simply based on binomial approximation
    Lower.Bound.of.CI.on.WR = pmax(
      0,
      (wr - 1.96 * sqrt(wr * (1 - wr) / games))
    ) *
      100,
    Upper.Bound.of.CI.on.WR = pmin(
      100,
      (wr + 1.96 * sqrt(wr * (1 - wr) / games))
    ) *
      100
  ) %>%
  select(
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

# Create data directory if it doesn't exist
if (!dir.exists("data")) {
  dir.create("data", recursive = TRUE)
}

# Write to CSV
write.csv(marav_data, "data/marav.csv", row.names = FALSE, quote = FALSE)

message(sprintf("Generated marav.csv with %d archetypes", nrow(marav_data)))
message(sprintf("Time window: %s to %s", params$start_date, params$end_date))
message(sprintf("Format: %s", params$format_name))
message("Saved to: data/marav.csv")
