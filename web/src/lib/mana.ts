// ---------------------------------------------------------------------------
// Mana-cost symbol parser (KTD10). Pure: maps the stored `{W/U}`-style cost
// string to symbol tokens whose files live on `svgs.scryfall.io`
// (`https://svgs.scryfall.io/card-symbols/<file>`). The ` // ` separator of
// split cards stays visible text; unknown symbols render as their brace text.
// No runtime Scryfall API calls — the CDN has no rate limit (KTD10).
// ---------------------------------------------------------------------------

export type ManaToken =
  | {
      kind: 'symbol'
      /** The brace text, e.g. "{W/U}" — the img alt. */ alt: string
      /** e.g. "WU.svg". */ file: string
    }
  | { kind: 'text'; text: string }

const COLORS = ['W', 'U', 'B', 'R', 'G'] as const

/** Scryfall's ten two-color pairs, in its canonical order — the order the
 *  file name uses (`{W/U}` → `WU.svg`; there is no `UW.svg`). */
const COLOR_PAIRS = [
  'W/U',
  'W/B',
  'U/B',
  'U/R',
  'B/R',
  'B/G',
  'R/G',
  'R/W',
  'G/W',
  'G/U',
] as const

/**
 * The brace contents Scryfall ships an SVG for, checked against its
 * `/symbology` list: generic 0-20, 100 and 1000000; the single letters (five
 * colors, colorless, snow, X/Y/Z, energy, tap, untap, generic phyrexian);
 * hybrid pairs, hybrid phyrexian, 2/color, color/P, C/P and C/color. Each
 * file name is the content with its slashes dropped. Anything else — `{X/Y}`,
 * a non-canonical `{U/W}`, `{21}` — makes the WHOLE symbol render as text
 * (KTD10: unknown symbols render as text, never a broken image).
 */
const KNOWN_SYMBOLS: ReadonlySet<string> = new Set([
  ...Array.from({ length: 21 }, (_, n) => String(n)),
  '100',
  '1000000',
  ...'WUBRGCSXYZETQP',
  ...COLOR_PAIRS,
  ...COLOR_PAIRS.map(pair => `${pair}/P`),
  ...COLORS.map(c => `2/${c}`),
  ...COLORS.map(c => `${c}/P`),
  'C/P',
  ...COLORS.map(c => `C/${c}`),
])

function symbolFile(content: string): string | null {
  return KNOWN_SYMBOLS.has(content)
    ? `${content.replaceAll('/', '')}.svg`
    : null
}

function pushGap(tokens: ManaToken[], gap: string): void {
  const trimmed = gap.trim()
  if (!trimmed) return
  // The split-card separator keeps its surrounding spaces when rendered.
  tokens.push({ kind: 'text', text: trimmed === '//' ? ' // ' : trimmed })
}

/**
 * Parse a stored mana cost into render tokens. `null` (no stored cost yet)
 * yields nothing. Examples:
 *   `{2}{W/U}{W/P}` → symbols `2.svg`, `WU.svg`, `WP.svg`
 *   `{R} // {2}{R}` → `{R}`, text ` // `, `{2}`, `{R}`
 */
export function parseManaCost(
  cost: string | null | undefined
): readonly ManaToken[] {
  if (!cost) return []
  const tokens: ManaToken[] = []
  const re = /\{([^{}]*)\}/g
  let last = 0
  for (const match of cost.matchAll(re)) {
    const gap = cost.slice(last, match.index)
    pushGap(tokens, gap)
    const alt = match[0]
    const file = symbolFile(match[1])
    if (file) tokens.push({ kind: 'symbol', alt, file })
    else tokens.push({ kind: 'text', text: alt })
    last = match.index + alt.length
  }
  pushGap(tokens, cost.slice(last))
  return tokens
}
