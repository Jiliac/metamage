import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  'get_archetype_overview',
  'get_archetype_winrate',
  'get_matchup_winrate',
  'get_sources',
  'search_card',
  'get_player',
  'search_player',
])

function isSuccinctTool(name: string) {
  return SUCCINCT_TOOLS.has(name)
}

function labelizeToolName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function summarizeToolCall(tc: ToolCall): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  switch (tc.toolName) {
    case 'list_formats':
      return 'All formats'
    case 'get_archetype_overview':
      return p.archetype_name ? `Archetype: ${p.archetype_name}` : ''
    case 'get_archetype_winrate':
      return [
        p.archetype_id ? `ID: ${String(p.archetype_id).slice(0, 8)}…` : null,
        p.start_date && p.end_date ? `${p.start_date} → ${p.end_date}` : null,
        p.exclude_mirror !== undefined
          ? `No mirror: ${p.exclude_mirror ? 'Yes' : 'No'}`
          : null,
      ]
        .filter(Boolean)
        .join(' • ')
    case 'get_matchup_winrate':
      return [
        p.archetype1_name && p.archetype2_name
          ? `${p.archetype1_name} vs ${p.archetype2_name}`
          : null,
        p.start_date && p.end_date ? `${p.start_date} → ${p.end_date}` : null,
      ]
        .filter(Boolean)
        .join(' • ')
    case 'get_sources':
      return [
        p.archetype_name ? `Arch: ${p.archetype_name}` : null,
        p.start_date && p.end_date ? `${p.start_date} → ${p.end_date}` : null,
        p.limit ? `Top ${p.limit}` : null,
      ]
        .filter(Boolean)
        .join(' • ')
    case 'search_card':
      return p.query ? `Query: "${p.query}"` : ''
    case 'get_player':
      return p.player_id ? `Player: ${p.player_id}` : ''
    case 'search_player':
      return p.player_handle ? `Handle: ${p.player_handle}` : ''
    default:
      return ''
  }
}

function renderSuccinctContent(tc: ToolCall) {
  const result = tc.toolResult?.resultContent as unknown

  switch (tc.toolName) {
    case 'list_formats': {
      if (typeof result === 'string') {
        return (
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        )
      }
      return (
        <pre className="text-xs text-slate-300 overflow-x-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
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
              {String((result as Record<string, unknown>).archetype_name)}
            </div>
            <div>
              <strong>Format:</strong>{' '}
              {String((result as Record<string, unknown>).format_name)}
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
                    {String((c as Record<string, unknown>).name)} — avg{' '}
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
    case 'get_archetype_winrate': {
      if (!result || typeof result !== 'object') {
        return (
          <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
        )
      }
      return (
        <div className="text-sm text-slate-200 grid grid-cols-2 gap-2">
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
          <div className="col-span-2">
            <strong>Winrate:</strong>{' '}
            {(result as Record<string, unknown>).winrate !== null &&
            (result as Record<string, unknown>).winrate !== undefined
              ? `${(((result as Record<string, unknown>).winrate as number) * 100).toFixed(2)}%`
              : '—'}
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
            <strong>Arch1 W-L-D:</strong>{' '}
            {String((result as Record<string, unknown>).arch1_wins)}-
            {String((result as Record<string, unknown>).arch1_losses)}-
            {String((result as Record<string, unknown>).draws)}
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
            <ul className="list-disc pl-5 text-slate-300">
              {sources.slice(0, 5).map((s, i) => (
                <li key={i}>
                  {String((s as Record<string, unknown>).tournament_name)} —{' '}
                  {new Date(
                    (s as Record<string, unknown>).date as string
                  ).toLocaleDateString()}{' '}
                  [{String((s as Record<string, unknown>).source)}]{' '}
                  {(s as Record<string, unknown>).link ? (
                    <a
                      href={(s as Record<string, unknown>).link as string}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-cyan-400"
                    >
                      (link)
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
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
    case 'get_player':
    case 'search_player': {
      if (typeof result === 'string') {
        return (
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        )
      }
      return (
        <pre className="text-xs text-slate-300">
          {JSON.stringify(result, null, 2)}
        </pre>
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
              {labelizeToolName(tc.toolName)}
            </span>
            <span className="text-xs text-slate-400 truncate">
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
