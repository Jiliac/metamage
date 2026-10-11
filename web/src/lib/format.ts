// Shared numeric formatters. One definition so every surface formats
// identically (previously re-declared per file).
/** 1,234-style integer grouping (en-US). */
export const int = (n: number) => n.toLocaleString('en-US')
/** 56.3%-style percentage with exactly one decimal. */
export const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`
