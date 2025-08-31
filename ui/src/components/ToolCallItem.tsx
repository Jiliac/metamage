import Link from 'next/link'
import { ToolCall } from '@/types/chat'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ShareButton } from './ShareButton'

const SUCCINCT_TOOLS = new Set<string>([
  'list_formats',
  'get_format_meta_changes',
  'get_archetype_overview',
  'get_archetype_winrate',
  'get_matchup_winrate',
  'get_sources',
  'search_card',
  'get_player',
])

function isSuccinctTool(name: string) {
  return SUCCINCT_TOOLS.has(name)
}

function labelizeToolName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function capitalizeWords(text: string) {
  return text.replace(/\b\w/g, c => c.toUpperCase())
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  const startYear = start.getFullYear()
  const endYear = end.getFullYear()

  // Same year
  if (startYear === endYear) {
    // Same month and year
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}–${endDay}, ${endYear}`
    }
    // Different months, same year
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`
  }

  // Different years
  return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`
}

interface Tournament {
  tournament_name: string
  date: string
  source: string
  link?: string
}

function TournamentList({ sources }: { sources: Tournament[] }) {
  const displayedSources = sources.slice(0, 5)

  const tournamentItems = displayedSources.map((tournament, i) => {
    const formattedDate = new Date(tournament.date).toLocaleDateString()
    const hasLink = Boolean(tournament.link)

    const tournamentName = hasLink ? (
      <a
        href={tournament.link}
        target="_blank"
        rel="noreferrer"
        className="underline text-cyan-400 hover:text-cyan-300"
      >
        {tournament.tournament_name}
      </a>
    ) : (
      <span>{tournament.tournament_name}</span>
    )

    return (
      <li key={i}>
        {tournamentName} — {formattedDate} [{tournament.source}]
      </li>
    )
  })

  return <ul className="list-disc pl-5 text-slate-300">{tournamentItems}</ul>
}

function summarizeToolCall(tc: ToolCall): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  const result = (tc.toolResult?.resultContent || {}) as Record<string, unknown>
  switch (tc.toolName) {
    case 'list_formats':
      return 'All formats'
    case 'get_format_meta_changes':
      return result.format_name
        ? `${capitalizeWords(String(result.format_name))}`
        : p.format_id
          ? `Format ${String(p.format_id).slice(0, 8)}…`
          : ''
    case 'get_archetype_overview':
      return p.archetype_name ? `${p.archetype_name}` : ''
    case 'get_archetype_winrate':
      return [
        result.archetype_name
          ? capitalizeWords(String(result.archetype_name))
          : null,
        p.start_date && p.end_date
          ? formatDateRange(String(p.start_date), String(p.end_date))
          : null,
      ]
        .filter(Boolean)
        .join(' • ')
    case 'get_matchup_winrate':
      if (!p.archetype1_name || !p.archetype2_name) return ''
      const arch1Name = capitalizeWords(p.archetype1_name as string)
      const arch2Name = capitalizeWords(p.archetype2_name as string)
      return [
        `${arch1Name} vs ${arch2Name}`,
        p.start_date && p.end_date
          ? formatDateRange(String(p.start_date), String(p.end_date))
          : null,
      ]
        .filter(Boolean)
        .join(' • ')
    case 'get_sources':
      return [
        p.archetype_name
          ? `${capitalizeWords(p.archetype_name as string)}`
          : null,
        p.start_date && p.end_date
          ? formatDateRange(String(p.start_date), String(p.end_date))
          : null,
      ]
        .filter(Boolean)
        .join(' • ')
    case 'search_card':
      return p.query ? `"${p.query}"` : ''
    case 'get_player':
      return p.player_id_or_handle ? `${p.player_id_or_handle}` : ''
    default:
      return ''
  }
}

function renderSuccinctContent(tc: ToolCall) {
  const result = tc.toolResult?.resultContent as unknown

  switch (tc.toolName) {
    case 'list_formats': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }
      const formats = Array.isArray((result as Record<string, unknown>).formats)
        ? ((result as Record<string, unknown>).formats as unknown[])
        : []
      const totalCount = (result as Record<string, unknown>).total_count
      const message = (result as Record<string, unknown>).message

      if (message) {
        return <div className="text-sm text-slate-400">{String(message)}</div>
      }

      return (
        <div className="text-sm text-slate-200 space-y-2">
          <div className="font-semibold">
            {totalCount
              ? `${totalCount} formats available`
              : 'Available formats'}
          </div>
          {formats.length > 0 && (
            <ul className="list-disc pl-5 text-slate-300">
              {formats.map((format, i) => {
                const f = format as Record<string, unknown>
                return (
                  <li key={i}>
                    <strong>{capitalizeWords(String(f.name))}</strong>
                    <br />
                    <span className="text-xs text-slate-400">
                      ID: {String(f.id).slice(0, 8)}…
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )
    }
    case 'get_format_meta_changes': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }

      // Handle error case
      if ((result as Record<string, unknown>).error) {
        return (
          <div className="text-sm text-red-400">
            {String((result as Record<string, unknown>).error)}
          </div>
        )
      }

      const metaChanges = Array.isArray(
        (result as Record<string, unknown>).meta_changes
      )
        ? ((result as Record<string, unknown>).meta_changes as unknown[])
        : []
      const formatName = (result as Record<string, unknown>).format_name
      const totalChanges = (result as Record<string, unknown>).total_changes
      const message = (result as Record<string, unknown>).message

      if (message) {
        return <div className="text-sm text-slate-400">{String(message)}</div>
      }

      return (
        <div className="text-sm text-slate-200 space-y-2">
          <div className="font-semibold">
            {formatName ? `${capitalizeWords(String(formatName))} — ` : ''}
            {totalChanges ? `${totalChanges} meta changes` : 'Meta changes'}
          </div>
          {metaChanges.length > 0 && (
            <ul className="list-disc pl-5 text-slate-300 space-y-1">
              {metaChanges.slice(0, 10).map((change, i) => {
                const c = change as Record<string, unknown>
                return (
                  <li key={i}>
                    <strong>{String(c.date)}</strong> —{' '}
                    {capitalizeWords(String(c.change_type))}
                    {c.set_code ? ` (${String(c.set_code)})` : ''}
                    {c.description ? (
                      <div className="text-xs text-slate-400 mt-1">
                        {String(c.description)}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )
    }
    case 'get_archetype_overview': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }
      const perf = (result as Record<string, unknown>).recent_performance || {}
      const cards = Array.isArray((result as Record<string, unknown>).key_cards)
        ? ((result as Record<string, unknown>).key_cards as unknown[])
        : []
      return (
        <div className="text-sm text-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong>Archetype:</strong>{' '}
              {capitalizeWords(
                String((result as Record<string, unknown>).archetype_name)
              )}
            </div>
            <div>
              <strong>Format:</strong>{' '}
              {capitalizeWords(
                String((result as Record<string, unknown>).format_name)
              )}
            </div>
            <div>
              <strong>Entries (30d):</strong>{' '}
              {String(
                (perf as Record<string, unknown>).tournament_entries ?? 0
              )}
            </div>
            <div>
              <strong>WR (no draws):</strong>{' '}
              {String((perf as Record<string, unknown>).winrate_percent ?? '—')}
              %
            </div>
          </div>
          {cards.length > 0 && (
            <div>
              <div className="font-semibold mb-1">Key cards</div>
              <ul className="list-disc pl-5 text-slate-300">
                {cards.slice(0, 8).map((c, i) => (
                  <li key={i}>
                    {capitalizeWords(
                      String((c as Record<string, unknown>).name)
                    )}{' '}
                    — {String((c as Record<string, unknown>).avg_copies)} in{' '}
                    {String((c as Record<string, unknown>).decks_playing)} decks
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )
    }
    case 'get_archetype_winrate': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }
      const excludeMirror = (result as Record<string, unknown>).exclude_mirror
      return (
        <div className="text-sm text-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong>Wins:</strong>{' '}
              {String((result as Record<string, unknown>).wins)}
            </div>
            <div>
              <strong>Losses:</strong>{' '}
              {String((result as Record<string, unknown>).losses)}
            </div>
            <div>
              <strong>Draws:</strong>{' '}
              {String((result as Record<string, unknown>).draws)}
            </div>
            <div>
              <strong>Matches:</strong>{' '}
              {String((result as Record<string, unknown>).matches)}
            </div>
          </div>
          <div>
            <strong>Winrate:</strong>{' '}
            {(result as Record<string, unknown>).winrate !== null &&
            (result as Record<string, unknown>).winrate !== undefined
              ? `${(((result as Record<string, unknown>).winrate as number) * 100).toFixed(2)}%`
              : '—'}
          </div>
          <div className="text-xs text-slate-400">
            {excludeMirror
              ? 'Mirror matches excluded from winrate calculation'
              : 'Mirror matches included in winrate calculation'}
          </div>
        </div>
      )
    }
    case 'get_matchup_winrate': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }
      return (
        <div className="text-sm text-slate-200 space-y-1">
          <div>
            <strong>Decisive:</strong>{' '}
            {String((result as Record<string, unknown>).decisive_matches)}
          </div>
          <div>
            <strong>Wins:</strong>{' '}
            {String((result as Record<string, unknown>).arch1_wins)}
          </div>
          <div>
            <strong>Losses:</strong>{' '}
            {String((result as Record<string, unknown>).arch1_losses)}
          </div>
          <div>
            <strong>Winrate (no draws):</strong>{' '}
            {(result as Record<string, unknown>).winrate_no_draws !== null &&
            (result as Record<string, unknown>).winrate_no_draws !== undefined
              ? `${(result as Record<string, unknown>).winrate_no_draws}%`
              : '—'}
          </div>
        </div>
      )
    }
    case 'get_sources': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }
      const sources = Array.isArray((result as Record<string, unknown>).sources)
        ? ((result as Record<string, unknown>).sources as unknown[])
        : []
      const summary = (result as Record<string, unknown>).summary || {}
      return (
        <div className="text-sm text-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong>Total tournaments:</strong>{' '}
              {String(
                (summary as Record<string, unknown>).total_tournaments ??
                  sources.length
              )}
            </div>
            <div>
              <strong>Breakdown:</strong>{' '}
              {(summary as Record<string, unknown>).source_percentages
                ? Object.entries(
                    (summary as Record<string, unknown>)
                      .source_percentages as Record<string, unknown>
                  )
                    .map(([k, v]) => `${k}: ${v}%`)
                    .join(' • ')
                : '—'}
            </div>
          </div>
          {sources.length > 0 && (
            <TournamentList sources={sources as Tournament[]} />
          )}
        </div>
      )
    }
    case 'search_card': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }
      return (
        <div className="text-sm text-slate-200 grid grid-cols-2 gap-2">
          <div>
            <strong>Name:</strong>{' '}
            {String((result as Record<string, unknown>).name)}
          </div>
          <div>
            <strong>Card ID:</strong>{' '}
            {(result as Record<string, unknown>).card_id
              ? `${String((result as Record<string, unknown>).card_id).slice(0, 8)}…`
              : '—'}
          </div>
          <div className="col-span-2">
            <strong>Type:</strong>{' '}
            {String((result as Record<string, unknown>).type) ?? '—'}
          </div>
          <div>
            <strong>Mana:</strong>{' '}
            {String((result as Record<string, unknown>).mana_cost) ?? '—'}
          </div>
          <div>
            <strong>Land:</strong>{' '}
            {(result as Record<string, unknown>).is_land ? 'Yes' : 'No'}
          </div>
        </div>
      )
    }
    case 'get_player': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }

      // Handle error case
      if ((result as Record<string, unknown>).error) {
        return (
          <div className="text-sm text-red-400">
            {String((result as Record<string, unknown>).error)}
          </div>
        )
      }

      const perf = (result as Record<string, unknown>).recent_performance || {}
      const recentResults = Array.isArray(
        (result as Record<string, unknown>).recent_results
      )
        ? ((result as Record<string, unknown>).recent_results as unknown[])
        : []

      return (
        <div className="text-sm text-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong>Player:</strong>{' '}
              {String((result as Record<string, unknown>).handle)}
            </div>
            <div>
              <strong>Tournaments:</strong>{' '}
              {String(
                (perf as Record<string, unknown>).tournaments_played ?? 0
              )}
            </div>
            <div>
              <strong>Total Entries:</strong>{' '}
              {String((perf as Record<string, unknown>).total_entries ?? 0)}
            </div>
            <div>
              <strong>Avg Rounds:</strong>{' '}
              {String((perf as Record<string, unknown>).avg_rounds ?? 0)}
            </div>
          </div>
          {recentResults.length > 0 && (
            <div>
              <div className="font-semibold mb-1">Recent Results</div>
              <ul className="list-disc pl-5 text-slate-300">
                {recentResults.slice(0, 5).map((r, i) => {
                  const result = r as Record<string, unknown>
                  const tournamentLink = result.tournament_link as string
                  const tournamentName = String(result.tournament_name)
                  const rank = result.rank

                  const tournamentDisplay = tournamentLink ? (
                    <a
                      href={tournamentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-cyan-400 hover:text-cyan-300"
                    >
                      {tournamentName}
                    </a>
                  ) : (
                    <span>{tournamentName}</span>
                  )

                  return (
                    <li key={i}>
                      {tournamentDisplay} —{' '}
                      {capitalizeWords(String(result.archetype_name))} (
                      {String(result.wins)}-{String(result.losses)}-
                      {String(result.draws)})
                      {rank ? ` — Rank ${String(rank)}` : ''}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )
    }
    default:
      return (
        <pre className="text-xs text-slate-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      )
  }
}

export function ToolCallItem({ tc }: { tc: ToolCall }) {
  if (!isSuccinctTool(tc.toolName)) {
    return (
      <Link href={`/tool/${tc.id}`} key={tc.id}>
        <div
          className="rounded-lg border border-slate-700 bg-slate-900/40 hover:bg-slate-700/40 px-4 py-2 my-3 text-slate-200 cursor-pointer transition-colors"
          title={tc.toolName}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">🛠️</span>
              <span className="font-medium">
                {labelizeToolName(tc.toolName)}
              </span>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Collapsible className="rounded-lg border border-slate-700 bg-slate-900/40 my-3 group">
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-slate-700/40 transition-colors group-data-[state=open]:border-b group-data-[state=open]:border-slate-800/60">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-slate-400">🛠️</span>
            <span className="font-medium text-slate-100">
              {labelizeToolName(tc.toolName)}:
            </span>
            <span className="text-sm font-semibold text-slate-200 group-data-[state=closed]:truncate ml-2">
              {summarizeToolCall(tc)}
            </span>
          </div>
          <div className="text-slate-400 group-data-[state=open]:rotate-180 transition-transform duration-300">
            ▼
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3 pt-3">
        {renderSuccinctContent(tc)}
        <ShareButton toolCallId={tc.id} />
      </CollapsibleContent>
    </Collapsible>
  )
}
