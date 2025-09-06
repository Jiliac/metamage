import Link from 'next/link'
import { ToolCall } from '@/types/chat'
import { ToolCallItemSuccinct } from './ToolCallItemSuccinct'
import { SUCCINCT_TOOLS, labelizeToolName } from '@/components/tool_utils'

export function ToolCallItemVerbose({ tc }: { tc: ToolCall }) {
  const toolName = tc.toolName
  let display = (
    <span className="font-medium">{labelizeToolName(toolName)}</span>
  )

  if (toolName == 'query_database') {
    const title = (tc.title || '').trim()
    display = (
      <>
        <span className="font-medium">Query</span>
        <span className="text-sm font-semibold text-slate-200 group-data-[state=closed]:truncate ml-2">
          {title}
        </span>
      </>
    )
  }

  return (
    <Link href={`/tool/${tc.id}`} key={tc.id}>
      <div
        className="rounded-lg border border-slate-700 bg-slate-900/40 hover:bg-slate-700/40 px-4 py-2 my-3 text-slate-200 cursor-pointer transition-colors"
        title={tc.toolName}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">🛠️</span>
            {display}
          </div>
        </div>
      </div>
    </Link>
  )
}

export function ToolCallItem({ tc }: { tc: ToolCall }) {
  if (!SUCCINCT_TOOLS.has(tc.toolName)) return <ToolCallItemVerbose tc={tc} />

  return <ToolCallItemSuccinct tc={tc} />
}
