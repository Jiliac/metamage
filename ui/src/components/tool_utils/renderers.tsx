import { ToolCall } from '@/types/chat'
import { ToolCallLike } from './types'
import { capitalizeWords } from './labels'

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

function renderListFormats(result: unknown) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
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
        {totalCount ? `${totalCount} formats available` : 'Available formats'}
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

function renderGetFormatMetaChanges(result: unknown) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
  }

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

function renderArchetypeOverview(result: unknown) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
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
          {String((perf as Record<string, unknown>).tournament_entries ?? 0)}
        </div>
        <div>
          <strong>WR (no draws):</strong>{' '}
          {String((perf as Record<string, unknown>).winrate_percent ?? '—')}%
        </div>
      </div>
      {cards.length > 0 && (
        <div>
          <div className="font-semibold mb-1">Key cards</div>
          <ul className="list-disc pl-5 text-slate-300">
            {cards.slice(0, 8).map((c, i) => (
              <li key={i}>
                {capitalizeWords(String((c as Record<string, unknown>).name))} —{' '}
                {String((c as Record<string, unknown>).avg_copies)} in{' '}
                {String((c as Record<string, unknown>).decks_playing)} decks
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function renderArchetypeWinrate(result: unknown) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
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

function renderMatchupWinrate(result: unknown) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
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

function renderSources(result: unknown) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
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

function renderSearchCard(result: unknown) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
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

function renderGetPlayer(result: unknown) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
  }

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
          {String((perf as Record<string, unknown>).tournaments_played ?? 0)}
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
                  {String(result.draws)}){rank ? ` — Rank ${String(rank)}` : ''}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function renderQueryDatabase(tc: ToolCall | ToolCallLike) {
  const rc: unknown = tc.toolResult?.resultContent
  const colNames = Array.isArray(tc.columnNames) ? tc.columnNames : undefined

  const extractArray = (val: unknown): unknown[] => {
    if (Array.isArray(val)) return val
    if (typeof val === 'object' && val !== null) {
      const obj = val as { rows?: unknown; data?: unknown }
      if (Array.isArray(obj.rows)) return obj.rows
      if (Array.isArray(obj.data)) return obj.data
    }
    return []
  }

  const rows = extractArray(rc)
  const rowCount = rows.length

  return (
    <div className="text-sm text-slate-200 space-y-2">
      <div>
        <strong>Rows:</strong> {rowCount}
      </div>
      <div>
        <strong>Columns:</strong>{' '}
        {Array.isArray(colNames) && colNames.length > 0
          ? colNames.join(', ')
          : '—'}
      </div>
      <div className="text-xs text-slate-400">
        View the full result table via the share page.
      </div>
    </div>
  )
}

export function renderSuccinctContent(tc: ToolCall | ToolCallLike) {
  const result = tc.toolResult?.resultContent as unknown

  switch (tc.toolName) {
    case 'list_formats':
      return renderListFormats(result)
    case 'get_format_meta_changes':
      return renderGetFormatMetaChanges(result)
    case 'get_archetype_overview':
      return renderArchetypeOverview(result)
    case 'get_archetype_winrate':
      return renderArchetypeWinrate(result)
    case 'get_matchup_winrate':
      return renderMatchupWinrate(result)
    case 'get_sources':
      return renderSources(result)
    case 'search_card':
      return renderSearchCard(result)
    case 'get_player':
      return renderGetPlayer(result)
    case 'query_database':
      return renderQueryDatabase(tc)
    default:
      return (
        <pre className="text-xs text-slate-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      )
  }
}
