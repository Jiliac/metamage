// ---------------------------------------------------------------------------
// Card-name title-case fallback (KTD11). `CARD_ADOPTION_SQL` and `getDeck`
// select `coalesce(display_name, name)`; the raw DB name is lowercase, so the
// fallback title-cases it at render: small words stay lowercase and words
// capitalize after hyphens ("soul-guide lantern" → "Soul-Guide Lantern").
// ---------------------------------------------------------------------------

/** Words that stay lowercase mid-name (English title-case convention). */
const SMALL_WORDS: Record<string, true> = {
  a: true,
  an: true,
  the: true,
  and: true,
  or: true,
  nor: true,
  but: true,
  of: true,
  to: true,
  in: true,
  on: true,
  at: true,
  by: true,
  for: true,
  with: true,
  from: true,
  as: true,
  into: true,
  onto: true,
}

/**
 * "blade of the bloodchief" → "Blade of the Bloodchief";
 * "soul-guide lantern" → "Soul-Guide Lantern";
 * "emrakul, the promised end" → "Emrakul, the Promised End";
 * "urza's saga" keeps "Urza's" (the possessive s stays lowercase).
 */
export function titleCaseName(raw: string): string {
  return raw
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (!word) return word
      // The first word always capitalizes, even when it is a small word.
      if (index > 0 && SMALL_WORDS[word]) return word
      // Capitalize the word's first letter and letters after hyphens/slashes.
      return word.replace(
        /(^|[-/])([a-z])/g,
        (_, sep: string, c: string) => sep + c.toUpperCase()
      )
    })
    .join(' ')
}
