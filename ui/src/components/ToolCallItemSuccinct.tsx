import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ToolCall } from '@/types/chat'
import { ShareButton } from './ShareButton'
import {
  labelizeToolName,
  summarizeToolCall,
  renderSuccinctContent,
} from './toolCallUtils'

/* helper functions moved to toolCallUtils.tsx */

export function ToolCallItemSuccinct({ tc }: { tc: ToolCall }) {
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
