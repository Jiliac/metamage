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

/**
 * One symbol component between slashes: a single letter from the atoms
 * Scryfall ships, or a plain number. Anything else makes the WHOLE symbol
 * render as text (KTD10: unknown symbols render as text).
 */
const ATOM_RE = /^(?:\d{1,7}|[WUBRGCSXETQP])$/

function symbolFile(content: string): string | null {
  let file = ''
  for (const atom of content.split('/')) {
    if (!ATOM_RE.test(atom)) return null
    file += atom
  }
  return file ? `${file}.svg` : null
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
