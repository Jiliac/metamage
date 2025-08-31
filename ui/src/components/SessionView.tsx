'use client'

import Link from 'next/link'
import { SessionData, Message, ToolCall } from '@/types/chat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'

interface SessionViewProps {
  initialSession: SessionData
}

type Turn = {
  user: Message
  agentMessages: Message[]
  startedAt: string
}

function labelizeToolName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function groupIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = []
  let current: Turn | null = null

  for (const m of messages) {
    if (m.messageType === 'user') {
      if (current) turns.push(current)
      current = {
        user: m,
        agentMessages: [],
        startedAt: m.createdAt,
      }
    } else {
      if (!current) continue
      // tool calls shown inline per message
      if (
        m.messageType === 'agent_thought' ||
        m.messageType === 'agent_final'
      ) {
        current.agentMessages.push(m)
      }
    }
  }
  if (current) turns.push(current)
  return turns
}

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

function summarizeToolCall(tc: ToolCall): string {
  const p = (tc.inputParams || {}) as Record<string, any>
  switch (tc.toolName) {
    case 'list_formats':
      return 'All formats'
    case 'get_archetype_overview':
      return p.archetype_name ? `Archetype: ${p.archetype_name}` : ''
    case 'get_archetype_winrate':
      return [
        p.archetype_id ? `ID: ${String(p.archetype_id).slice(0, 8)}…` : null,
        p.start_date && p.end_date ? `${p.start_date} → ${p.end_date}` : null,
        p.exclude_mirror !== undefined ? `No mirror: ${p.exclude_mirror ? 'Yes' : 'No'}` : null,
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
  const result = tc.toolResult?.resultContent as any
  const p = (tc.inputParams || {}) as Record<string, any>

  switch (tc.toolName) {
    case 'list_formats': {
      if (typeof result === 'string') {
        return (
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        )
      }
      return <pre className="text-xs text-slate-300 overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
    }
    case 'get_archetype_overview': {
      if (!result || typeof result !== 'object') {
        return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
      }
      const perf = result.recent_performance || {}
      const cards: any[] = Array.isArray(result.key_cards) ? result.key_cards : []
      return (
        <div className="text-sm text-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><strong>Archetype:</strong> {result.archetype_name}</div>
            <div><strong>Format:</strong> {result.format_name}</div>
            <div><strong>Entries (30d):</strong> {perf.tournament_entries ?? 0}</div>
            <div><strong>WR (no draws):</strong> {perf.winrate_percent ?? '—'}%</div>
          </div>
          {cards.length > 0 && (
            <div>
              <div className="font-semibold mb-1">Key cards</div>
              <ul className="list-disc pl-5 text-slate-300">
                {cards.slice(0, 8).map((c, i) => (
                  <li key={i}>{c.name} — avg {c.avg_copies} in {c.decks_playing} decks</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )
    }
    case 'get_archetype_winrate': {
      if (!result || typeof result !== 'object') {
        return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
      }
      return (
        <div className="text-sm text-slate-200 grid grid-cols-2 gap-2">
          <div><strong>Wins:</strong> {result.wins}</div>
          <div><strong>Losses:</strong> {result.losses}</div>
          <div><strong>Draws:</strong> {result.draws}</div>
          <div><strong>Matches:</strong> {result.matches}</div>
          <div className="col-span-2"><strong>Winrate:</strong> {result.winrate !== null && result.winrate !== undefined ? `${(result.winrate * 100).toFixed(2)}%` : '—'}</div>
        </div>
      )
    }
    case 'get_matchup_winrate': {
      if (!result || typeof result !== 'object') {
        return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
      }
      return (
        <div className="text-sm text-slate-200 space-y-1">
          <div><strong>Decisive:</strong> {result.decisive_matches}</div>
          <div><strong>Arch1 W-L-D:</strong> {result.arch1_wins}-{result.arch1_losses}-{result.draws}</div>
          <div><strong>Winrate (no draws):</strong> {result.winrate_no_draws !== null && result.winrate_no_draws !== undefined ? `${result.winrate_no_draws}%` : '—'}</div>
        </div>
      )
    }
    case 'get_sources': {
      if (!result || typeof result !== 'object') {
        return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
      }
      const sources: any[] = Array.isArray(result.sources) ? result.sources : []
      const summary = result.summary || {}
      return (
        <div className="text-sm text-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><strong>Total tournaments:</strong> {summary.total_tournaments ?? sources.length}</div>
            <div><strong>Breakdown:</strong> {summary.source_percentages ? Object.entries(summary.source_percentages).map(([k, v]) => `${k}: ${v}%`).join(' • ') : '—'}</div>
          </div>
          {sources.length > 0 && (
            <ul className="list-disc pl-5 text-slate-300">
              {sources.slice(0, 5).map((s, i) => (
                <li key={i}>
                  {s.tournament_name} — {new Date(s.date).toLocaleDateString()} [{s.source}] {s.link ? (<a href={s.link} target="_blank" rel="noreferrer" className="underline text-cyan-400">(link)</a>) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }
    case 'search_card': {
      if (!result || typeof result !== 'object') {
        return <pre className="text-xs text-slate-300">{String(result ?? '')}</pre>
      }
      return (
        <div className="text-sm text-slate-200 grid grid-cols-2 gap-2">
          <div><strong>Name:</strong> {result.name}</div>
          <div><strong>Card ID:</strong> {result.card_id ? `${String(result.card_id).slice(0, 8)}…` : '—'}</div>
          <div className="col-span-2"><strong>Type:</strong> {result.type ?? '—'}</div>
          <div><strong>Mana:</strong> {result.mana_cost ?? '—'}</div>
          <div><strong>Land:</strong> {result.is_land ? 'Yes' : 'No'}</div>
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
      return <pre className="text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre>
    }
    default:
      return <pre className="text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre>
  }
}

function ToolCallItem({ tc }: { tc: ToolCall }) {
  if (!isSuccinctTool(tc.toolName)) {
    return (
      <div
        key={tc.id}
        className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 my-3 text-slate-200"
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
    )
  }

  return (
    <Collapsible className="rounded-lg border border-slate-700 bg-slate-900/40 my-3">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-slate-400">🛠️</span>
          <span className="font-medium text-slate-100">
            {labelizeToolName(tc.toolName)}
          </span>
          <span className="text-xs text-slate-400 truncate">
            {summarizeToolCall(tc)}
          </span>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white">
            Details
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="px-4 pb-3">
        <div className="border-t border-slate-800/60 pt-3">
          {renderSuccinctContent(tc)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function SessionView({ initialSession }: SessionViewProps) {
  const turns = groupIntoTurns(initialSession.messages)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-6 py-8 max-w-4xl pt-20">
        <div className="mb-6">
          <Link
            href="/sessions"
            className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-block"
          >
            ← Back to Sessions
          </Link>

          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-white">
              Session{' '}
              <span className="text-cyan-400">
                {initialSession.id.substring(0, 8)}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>{turns.length} requests</span>
            <span>
              Started {new Date(initialSession.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          {turns.map(turn => {
            return (
              <div key={turn.user.id} className="space-y-4">
                {/* User message - right aligned */}
                <div className="flex justify-end mr-4 my-7">
                  <div className="bg-slate-700 rounded-2xl px-5 py-4 max-w-3xl">
                    <div className="text-slate-100 whitespace-pre-wrap">
                      {turn.user.content}
                    </div>
                  </div>
                </div>

                {/* Assistant response - left aligned, no border */}
                <div className="space-y-3">
                  {turn.agentMessages.filter(
                    m => m.messageType === 'agent_thought'
                  ).length > 0 ? (
                    <div className="space-y-3">
                      {turn.agentMessages
                        .filter(m => m.messageType === 'agent_thought')
                        .map(m => (
                          <div key={m.id}>
                            <div className="prose mb-2">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {m.content}
                              </ReactMarkdown>
                            </div>

                            {m.toolCalls?.map(tc => (
                              <ToolCallItem key={tc.id} tc={tc} />
                            ))}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm italic">
                      Working on it…
                    </div>
                  )}

                  {turn.agentMessages.find(
                    m => m.messageType === 'agent_final'
                  ) && (
                    <div className="prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {
                          turn.agentMessages.find(
                            m => m.messageType === 'agent_final'
                          )!.content
                        }
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
