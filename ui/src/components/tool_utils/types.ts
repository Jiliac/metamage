export interface ToolCallLike {
  id: string
  toolName: string
  inputParams?: unknown
  callId?: string
  title?: string | null
  columnNames?: string[] | null
  toolResult?: { resultContent: unknown } | null
}

export const SUCCINCT_TOOLS = new Set<string>([
  'list_formats',
  'get_format_meta_changes',
  'get_archetype_overview',
  'get_archetype_winrate',
  'get_matchup_winrate',
  'get_sources',
  'search_card',
  'get_player',
])
