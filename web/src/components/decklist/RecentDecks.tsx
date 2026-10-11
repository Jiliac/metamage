import Link from 'next/link'

import {
  deckResultLabel,
  decksCapLabel,
  groupEntriesByEvent,
  type DecksPage,
} from '@/lib/decks'
import { cn } from '@/lib/utils'

import { DeckLink } from './DeckNav'
import { shortDate } from './DecklistView'

// ---------------------------------------------------------------------------
// RecentDecks — the archetype's recent-decks column (R9/R12). Rows are
// grouped by event, newest first, each showing player and placing/record;
// the featured row carries a "Featured" tag and a deck without a published
// list renders as plain text tagged "no list published". The active row is
// highlighted and its link carries aria-current. Past the loaded rows, "Show
// older decks" pages through the URL (KTD8) and past the cap the list ends
// with the R12 note and the control disappears.
// ---------------------------------------------------------------------------

const FEATURED_TAG = (
  <span className="inline-block shrink-0 border border-gold-soft px-1.5 py-px text-[10px] font-bold tracking-[0.08em] text-gold">
    Featured
  </span>
)

const NO_LIST_TAG = (
  <span className="inline-block shrink-0 border border-line px-1.5 py-px text-[10px] font-bold tracking-[0.08em] text-ink-3">
    no list published
  </span>
)

export type RecentDecksProps = {
  /** The sliced recent-decks page (KTD8). */
  page: DecksPage
  /** The featured pick's entry id — its row carries the tag (R9). */
  featuredId: string | null
  /** The currently shown deck's entry id — its link gets aria-current. */
  activeId: string | undefined
  /** URL for one deck row (keeps the current ?decks page, sets ?deck). */
  deckHref: (entryId: string) => string
  /** The next ?decks page's URL, or null when there is nothing more. */
  olderHref: string | null
  className?: string
}

export function RecentDecks({
  page,
  featuredId,
  activeId,
  deckHref,
  olderHref,
  className,
}: RecentDecksProps) {
  const groups = groupEntriesByEvent(page.visible)
  return (
    <div
      className={cn('border border-line bg-surface shadow-ledger', className)}
    >
      {/* A real h2: the per-event h3s below sit under it, so the outline runs
          h1 (archetype) → h2 → h3 with no skipped level. */}
      <h2 className="eyebrow border-b border-line px-4 py-3">Recent decks</h2>
      {groups.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-3">
          No decks recorded for this window.
        </p>
      ) : (
        <div className="divide-y divide-line">
          {groups.map(g => (
            <section key={g.event.id} className="px-4 py-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="text-[12.5px] font-semibold text-ink">
                  {g.event.name}
                </h3>
                <span className="data text-[11.5px] text-ink-3">
                  {shortDate(g.event.date)}
                </span>
              </div>
              <ul className="grid gap-1">
                {g.entries.map(entry => {
                  const label = deckResultLabel(entry)
                  const active = entry.id === activeId
                  return (
                    <li key={entry.id}>
                      {entry.hasCards ? (
                        <DeckLink
                          href={deckHref(entry.id)}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'flex items-baseline gap-2 rounded-none py-px text-[13px]',
                            active
                              ? 'bg-gold-wash text-gold'
                              : 'text-ink hover:text-gold'
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {entry.player}
                          </span>
                          {label && (
                            <span className="num shrink-0 whitespace-nowrap text-[11.5px] text-ink-3">
                              {label}
                            </span>
                          )}
                          {entry.id === featuredId && FEATURED_TAG}
                        </DeckLink>
                      ) : (
                        <span className="flex items-baseline gap-2 py-px text-[13px] text-ink-3">
                          <span className="min-w-0 flex-1 truncate">
                            {entry.player}
                          </span>
                          {NO_LIST_TAG}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {(olderHref || page.capReached) && (
        <div className="border-t border-line px-4 py-3">
          {olderHref && (
            <Link
              href={olderHref}
              className="text-[13px] font-semibold text-gold hover:underline hover:underline-offset-[3px]"
            >
              Show older decks
            </Link>
          )}
          {page.capReached && (
            <p className="text-[12px] text-ink-3">
              {decksCapLabel(page.shown, page.total)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default RecentDecks
