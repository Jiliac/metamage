import Link from 'next/link'
import { ToolCall } from '@/types/chat'
import { ToolCallItemSuccinct } from './ToolCallItemSuccinct'

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

  return <ToolCallItemSuccinct tc={tc} />
}
