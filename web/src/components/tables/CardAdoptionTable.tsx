import type { CardAdoptionDTO } from '@/datasource/types'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/** DB card names are stored lowercase; title-case them at render (blueprint §3). */
function titleCase(name: string): string {
  return name.replace(/\b[a-z]/g, c => c.toUpperCase())
}

/**
 * `presencePct` may arrive as a fraction (0..1) or an already-scaled percent
 * (0..100). Normalize to a clamped 0..100 so the adoption bar is robust to
 * whichever convention the data layer settles on.
 */
function toPercent(v: number): number {
  const pct = v <= 1 ? v * 100 : v
  return Math.max(0, Math.min(100, pct))
}

export type CardAdoptionTableProps = {
  cards: CardAdoptionDTO[]
  className?: string
  emptyLabel?: string
}

/**
 * Card-adoption table for the archetype decklist tab: title-cased card name,
 * average copies, decks playing it, and a presence bar. Server-renderable — no
 * client sorting needed for the skeleton.
 */
export function CardAdoptionTable({
  cards,
  className,
  emptyLabel = 'No cards to show.',
}: CardAdoptionTableProps) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Card</TableHead>
            <TableHead className="text-right">Avg</TableHead>
            <TableHead className="text-right">Decks</TableHead>
            <TableHead className="w-[36%]">Adoption</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cards.map(card => {
            const pct = toPercent(card.presencePct)
            return (
              <TableRow key={`${card.board}:${card.cardId}`}>
                <TableCell className="font-medium">
                  {titleCase(card.name)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {card.avgCount.toFixed(1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {card.decksPlaying.toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-cool"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {cards.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-6 text-center text-muted-foreground"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
