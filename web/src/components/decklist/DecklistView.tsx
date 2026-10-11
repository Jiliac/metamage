import {
  groupMaindeck,
  placingOrRecord,
  sortSideboard,
  type DeckTypeGroup,
} from '@/lib/decks'
import { titleCaseName } from '@/lib/card-names'
import type { DeckCardDTO, DeckDTO } from '@/datasource/types'

import { CardPreview } from './CardPreview'
import { ManaCost } from './ManaCost'

// ---------------------------------------------------------------------------
// DecklistView — the paper-list rendering of one deck (U6). Deliberately free
// of page or URL knowledge: it takes a DeckDTO and a `featured` flag, so the
// tournament page can reuse it (plan §U6). The header shows the event, date,
// player, placing/record and source link (R2), labelled as the featured pick
// when it is one (R1). The maindeck renders in the R3 type order with summed
// group counts; Lands and the sideboard sit in the right column and groups
// never split across columns (R16). Sideboard is labelled "Commander" in Duel
// Commander (R6); entries without deck cards render "No decklist published".
// ---------------------------------------------------------------------------

/** Anchor id the mobile pick-scroll targets (R17); shared with DeckNav. */
export const DECK_HEADER_ID = 'decklist-header'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** "2026-10-11" → "Oct 11" (same convention as the tournaments table). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${MONTHS[m - 1]} ${d}`
}

export type DecklistViewProps = {
  deck: DeckDTO
  /** True when this deck is the featured pick — renders the R1 label. */
  featured: boolean
}

export function DecklistView({ deck, featured }: DecklistViewProps) {
  const { entry, main, side } = deck
  const groups = groupMaindeck(main)
  const sideCards = sortSideboard(side)
  // R16: non-land groups flow in the left column; Lands, then Sideboard or
  // Commander, in the right. A group is never split across columns.
  const lands = groups.find(g => g.key === 'lands')
  const leftGroups = groups.filter(g => g.key !== 'lands')
  const sourceHref = entry.decklistUrl ?? entry.event.link
  const placing = placingOrRecord(entry)
  const cardless = main.length === 0 && side.length === 0

  return (
    <article id={DECK_HEADER_ID} className="scroll-mt-24">
      <header>
        {featured && (
          <p className="eyebrow mb-2">
            Featured — most match points, last 14 days of play
          </p>
        )}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-[22px] font-bold text-ink">
            {entry.event.name}
          </h2>
          <span className="data text-[12.5px] text-ink-3">
            {shortDate(entry.event.date)}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13.5px] text-ink-2">
          <span className="font-semibold text-ink">{entry.player}</span>
          {placing && <span className="data">{placing}</span>}
          {sourceHref && (
            <a
              href={sourceHref}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gold hover:underline hover:underline-offset-[3px]"
            >
              Source
            </a>
          )}
        </p>
      </header>

      {cardless ? (
        <p className="mt-4 border border-line bg-surface px-4 py-6 text-[13.5px] text-ink-3 shadow-ledger">
          No decklist published
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-x-10">
          <div className="min-w-0">
            {leftGroups.map(g => (
              <TypeGroup key={g.key} group={g} />
            ))}
          </div>
          <div className="min-w-0">
            {lands && <TypeGroup group={lands} />}
            {sideCards.length > 0 && (
              <section className="mb-6 last:mb-0">
                <header className="mb-1.5 flex items-baseline justify-between border-b border-line pb-1">
                  <h3 className="eyebrow">
                    {deck.format === 'duel-commander'
                      ? 'Commander'
                      : 'Sideboard'}
                  </h3>
                  <span className="num text-[12.5px] text-ink-2">
                    {sideCards.reduce((sum, c) => sum + c.count, 0)}
                  </span>
                </header>
                <ul>
                  {sideCards.map(c => (
                    <CardRow key={c.cardId} card={c} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function TypeGroup({ group }: { group: DeckTypeGroup }) {
  return (
    <section className="mb-6 last:mb-0">
      <header className="mb-1.5 flex items-baseline justify-between border-b border-line pb-1">
        <h3 className="eyebrow">{group.label}</h3>
        <span className="num text-[12.5px] text-ink-2">{group.count}</span>
      </header>
      <ul>
        {group.cards.map(c => (
          <CardRow key={c.cardId} card={c} />
        ))}
      </ul>
    </section>
  )
}

function CardRow({ card }: { card: DeckCardDTO }) {
  // KTD11: the stored display_name is proper-cased already; a card without
  // stored data has only the raw lowercase DB name, so title-case it (R5).
  const label = card.typeLine === null ? titleCaseName(card.name) : card.name
  return (
    <li className="flex items-baseline gap-2.5 py-[3px] text-[13.5px] leading-snug">
      <span className="num w-6 shrink-0 text-right text-ink-3">
        {card.count}
      </span>
      <span className="min-w-0 flex-1">
        {card.imageNormal ? (
          <CardPreview
            name={card.name}
            label={label}
            imageNormal={card.imageNormal}
            imageBack={card.imageBack}
          />
        ) : (
          <span className="font-semibold text-ink">{label}</span>
        )}
      </span>
      <ManaCost cost={card.manaCost} />
    </li>
  )
}

export default DecklistView
