import { parseManaCost } from '@/lib/mana'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// ManaCost — renders a stored `{W/U}`-style cost as Scryfall symbol images
// (KTD10). Each symbol's alt is its brace text, so a screen reader reads the
// cost as written; unknown symbols and the ` // ` separator of split cards
// render as plain text. The CDN (`svgs.scryfall.io`) has no rate limit and
// needs no new dependency — and this never touches the Scryfall API (R15).
// ---------------------------------------------------------------------------

const SYMBOL_BASE = 'https://svgs.scryfall.io/card-symbols/'
const SYMBOL_SIZE = 15

export type ManaCostProps = {
  /** The stored mana cost, or null when the card has no data yet (R5). */
  cost: string | null | undefined
  className?: string
}

export function ManaCost({ cost, className }: ManaCostProps) {
  const tokens = parseManaCost(cost)
  if (tokens.length === 0) return null
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-[1.5px]', className)}
    >
      {tokens.map((token, i) =>
        token.kind === 'symbol' ? (
          // eslint-disable-next-line @next/next/no-img-element -- KTD10: CDN symbol svgs; next/image would spend optimization quota
          <img
            key={i}
            src={`${SYMBOL_BASE}${token.file}`}
            alt={token.alt}
            width={SYMBOL_SIZE}
            height={SYMBOL_SIZE}
            loading="lazy"
            className="h-[15px] w-[15px]"
          />
        ) : (
          <span key={i} className="data text-ink-3 whitespace-pre">
            {token.text}
          </span>
        )
      )}
    </span>
  )
}

export default ManaCost
