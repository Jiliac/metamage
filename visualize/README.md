# Visualization (R)

Overview
- Generate Meta Overview plots and a compact CSV export over a chosen window.

Requirements
- R installed. Packages auto-installed on first run.

Config (env overrides)
- MTG_FORMAT (e.g., Modern, Vintage)
- START_DATE, END_DATE (YYYY-MM-DD)
- TOP_N, MATRIX_TOP_N (limits)
- TOURNAMENT_DB_PATH (defaults to data/tournament.db)

Run
- Rscript visualize/run.R
- Example:
  - MTG_FORMAT=Vintage START_DATE=2025-08-01 END_DATE=2025-09-15 Rscript visualize/run.R

Outputs
- Results/<Format>/<Year>/<MM-DD-MM-DD>/
  - meta_matrix.png, meta_presence.png, meta_wr_ci.png, meta_wr_presence.png, meta_tiers.png

CSV export
- Rscript visualize/get_marav.R
  - Writes data/marav.csv (aggregated archetype stats)

Methods
- Wilson CIs with optional clustered CIs by player
- Tiering based on lower CI bounds

If you don’t have the tournament.db, email: valentinmanes@outlook.fr for a prebuilt SQLite DB.
