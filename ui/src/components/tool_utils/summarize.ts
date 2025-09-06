import { ToolCall } from '@/types/chat'
import { ToolCallLike } from './types'
import { capitalizeWords, formatDateRange } from './labels'

function summarizeListFormats(): string {
  return 'All formats'
}

function summarizeGetFormatMetaChanges(tc: ToolCall | ToolCallLike): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  const result = (tc.toolResult?.resultContent || {}) as Record<string, unknown>
  return result.format_name
    ? `${capitalizeWords(String(result.format_name))}`
    : p.format_id
      ? `Format ${String(p.format_id).slice(0, 8)}…`
      : ''
}

function summarizeArchetypeOverview(tc: ToolCall | ToolCallLike): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  return p.archetype_name ? `${p.archetype_name}` : ''
}

function summarizeArchetypeWinrate(tc: ToolCall | ToolCallLike): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  const result = (tc.toolResult?.resultContent || {}) as Record<string, unknown>
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
}

function summarizeMatchupWinrate(tc: ToolCall | ToolCallLike): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
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
}

function summarizeSources(tc: ToolCall | ToolCallLike): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  return [
    p.archetype_name ? `${capitalizeWords(p.archetype_name as string)}` : null,
    p.start_date && p.end_date
      ? formatDateRange(String(p.start_date), String(p.end_date))
      : null,
  ]
    .filter(Boolean)
    .join(' • ')
}

function summarizeSearchCard(tc: ToolCall | ToolCallLike): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  return p.query ? `"${p.query}"` : ''
}

function summarizeGetPlayer(tc: ToolCall | ToolCallLike): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  return p.player_id_or_handle ? `${p.player_id_or_handle}` : ''
}

function summarizeQueryDatabase(tc: ToolCall | ToolCallLike): string {
  const p = (tc.inputParams || {}) as Record<string, unknown>
  const title = (tc.title || '').trim()
  if (title) return title
  const sql = typeof p.sql === 'string' ? p.sql : ''
  return sql
    ? `Query: ${sql.slice(0, 60)}${sql.length > 60 ? '…' : ''}`
    : 'Custom Query'
}

export function summarizeToolCall(tc: ToolCall | ToolCallLike): string {
  switch (tc.toolName) {
    case 'list_formats':
      return summarizeListFormats()
    case 'get_format_meta_changes':
      return summarizeGetFormatMetaChanges(tc)
    case 'get_archetype_overview':
      return summarizeArchetypeOverview(tc)
    case 'get_archetype_winrate':
      return summarizeArchetypeWinrate(tc)
    case 'get_matchup_winrate':
      return summarizeMatchupWinrate(tc)
    case 'get_sources':
      return summarizeSources(tc)
    case 'search_card':
      return summarizeSearchCard(tc)
    case 'get_player':
      return summarizeGetPlayer(tc)
    case 'query_database':
      return summarizeQueryDatabase(tc)
    default:
      return ''
  }
}
