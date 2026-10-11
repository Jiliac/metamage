// ---------------------------------------------------------------------------
// Card-name title-case fallback (KTD11). `CARD_ADOPTION_SQL` and `getDeck`
// select `coalesce(display_name, name)`; the raw DB name is lowercase, so the
// fallback title-cases it at render: small words stay lowercase and words
// capitalize after hyphens ("soul-guide lantern" → "Soul-Guide Lantern").
// ---------------------------------------------------------------------------

/** Words that stay lowercase mid-name (English title-case convention). A
 *  Set, not an object literal, so prototype keys ("constructor") never match. */
const SMALL_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'nor',
  'but',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'as',
  'into',
  'onto',
])

/**
 * "blade of the bloodchief" → "Blade of the Bloodchief";
 * "soul-guide lantern" → "Soul-Guide Lantern";
 * "emrakul, the promised end" → "Emrakul, the Promised End";
 * "lim-dûl's vault" → "Lim-Dûl's Vault" (non-ASCII letters capitalize);
 * "urza's saga" keeps "Urza's" (the possessive s stays lowercase).
 */
export function titleCaseName(raw: string): string {
  return raw
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (!word) return word
      // The first word always capitalizes, even when it is a small word.
      if (index > 0 && SMALL_WORDS.has(word)) return word
      // Capitalize the word's first letter and letters after hyphens/slashes.
      // `\p{L}` (not `[a-z]`) so non-ASCII initials capitalize too ("éowyn").
      return word.replace(
        /(^|[-/])(\p{L})/gu,
        (_, sep: string, c: string) => sep + c.toUpperCase()
      )
    })
    .join(' ')
}
