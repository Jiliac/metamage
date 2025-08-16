suppressPackageStartupMessages({
  library(scales)
  library(dplyr)
})

okabe_ito <- c(
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#999999",
  "#000000",
  "#009E73",
  "#F5793A",
  "#8491B4",
  "#66C2A5",
  "#FC8D62",
  "#8DA0CB",
  "#E78AC3",
  "#A6D854",
  "#FFD92F",
  "#E5C494",
  "#B3B3B3"
)

assign_archetype_colors <- function(archetype_names) {
  n <- length(archetype_names)
  base_pal <- rep(okabe_ito, length.out = n)
  cols <- setNames(base_pal[seq_len(n)], archetype_names)
  # Force neutral gray for "Other" if present
  if ("Other" %in% archetype_names) {
    cols["Other"] <- "#BBBBBB"
  }
  cols
}
