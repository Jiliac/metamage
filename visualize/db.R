suppressPackageStartupMessages({
  library(DBI)
  library(RSQLite)
  library(glue)
  library(dplyr)
  library(tidyr)
  library(stringr)
  library(lubridate)
})

connect_db <- function(db_path) {
  if (!file.exists(db_path)) {
    stop(sprintf("SQLite database not found at %s", db_path))
  }
  DBI::dbConnect(RSQLite::SQLite(), dbname = db_path)
}

get_format_id <- function(con, format_name) {
  sql <- glue::glue_sql(
    "SELECT id, name FROM formats WHERE lower(name) = lower({format_name}) LIMIT 1;",
    .con = con
  )
  df <- DBI::dbGetQuery(con, sql)
  if (nrow(df) == 0) {
    stop(sprintf("Format not found: %s", format_name))
  }
  df$id[[1]]
}

fetch_presence <- function(con, format_id, start_date, end_date) {
  sql <- glue::glue_sql(
    "
    SELECT a.name AS archetype_name,
           COUNT(DISTINCT e.id) AS entries
    FROM tournaments t
    JOIN tournament_entries e ON e.tournament_id = t.id
    JOIN archetypes a ON a.id = e.archetype_id
    WHERE t.format_id = {format_id}
      AND t.date >= {start_date}
      AND t.date <= {end_date}
    GROUP BY a.name;
    ",
    .con = con
  )
  pres <- DBI::dbGetQuery(con, sql) %>%
    mutate(entries = as.integer(entries)) %>%
    arrange(desc(entries))
  total_entries <- sum(pres$entries)
  pres %>%
    mutate(share = entries / total_entries) %>%
    arrange(desc(share))
}

fetch_wr_by_archetype <- function(con, format_id, start_date, end_date) {
  sql <- glue::glue_sql(
    "
    SELECT a.name AS archetype_name,
           SUM(CASE WHEN m.result = 'WIN' THEN 1 ELSE 0 END)   AS wins,
           SUM(CASE WHEN m.result = 'LOSS' THEN 1 ELSE 0 END)  AS losses,
           SUM(CASE WHEN m.result = 'DRAW' THEN 1 ELSE 0 END)  AS draws
    FROM tournaments t
    JOIN tournament_entries e ON e.tournament_id = t.id
    JOIN archetypes a ON a.id = e.archetype_id
    JOIN matches m ON m.entry_id = e.id
    WHERE t.format_id = {format_id}
      AND t.date >= {start_date}
      AND t.date <= {end_date}
    GROUP BY a.name;
    ",
    .con = con
  )
  DBI::dbGetQuery(con, sql) %>%
    mutate(
      wins   = as.integer(wins),
      losses = as.integer(losses),
      draws  = as.integer(draws),
      games  = wins + losses + draws,
      points = wins + 0.5 * draws,
      wr     = ifelse(games > 0, points / games, NA_real_)
    )
}

fetch_matchups <- function(con, format_id, start_date, end_date) {
  sql <- glue::glue_sql(
    "
    SELECT a.name  AS row_archetype,
           a2.name AS col_archetype,
           SUM(CASE WHEN m.result = 'WIN'  THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN m.result = 'LOSS' THEN 1 ELSE 0 END) AS losses,
           SUM(CASE WHEN m.result = 'DRAW' THEN 1 ELSE 0 END) AS draws
    FROM tournaments t
    JOIN tournament_entries e  ON e.tournament_id = t.id
    JOIN archetypes a          ON a.id = e.archetype_id
    JOIN matches m             ON m.entry_id = e.id
    JOIN tournament_entries e2 ON e2.id = m.opponent_entry_id
    JOIN archetypes a2         ON a2.id = e2.archetype_id
    WHERE t.format_id = {format_id}
      AND t.date >= {start_date}
      AND t.date <= {end_date}
    GROUP BY a.name, a2.name;
    ",
    .con = con
  )
  DBI::dbGetQuery(con, sql) %>%
    mutate(
      wins   = as.integer(wins),
      losses = as.integer(losses),
      draws  = as.integer(draws),
      games  = wins + losses + draws,
      points = wins + 0.5 * draws,
      wr     = ifelse(games > 0, points / games, NA_real_)
    )
}
