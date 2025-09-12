'use client'

import QueryResultTable from '@/components/QueryResultTable'
import { Prisma } from '@prisma/client'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'sql-formatter'
import { useState } from 'react'
//
// Extract raw data array from various result content shapes
function extractRawData(
  resultContent: unknown
): Array<Record<string, unknown>> {
  if (Array.isArray(resultContent)) {
    return resultContent
  }
  if (typeof resultContent === 'object' && resultContent !== null) {
    const obj = resultContent as { rows?: unknown; data?: unknown }
    if (Array.isArray(obj.rows)) return obj.rows
    if (Array.isArray(obj.data)) return obj.data
  }
  return []
}

type ToolCallWithRelations = Prisma.ToolCallGetPayload<{
  include: {
    toolResult: true
    message: {
      include: {
        session: true
      }
    }
  }
}>

export function ToolResultView({
  toolCall,
}: {
  toolCall: ToolCallWithRelations
}) {
  const [isQueryOpen, setIsQueryOpen] = useState(false)

  if (toolCall.toolName === 'query_database' && toolCall.toolResult) {
    console.log(JSON.stringify(toolCall.toolResult.resultContent, null, 2))
    const sqlQuery =
      ((toolCall.inputParams as Record<string, unknown>)?.sql as string) || ''

    // Extract raw data without transformation
    const rawData = extractRawData(toolCall.toolResult.resultContent)

    // Pass column mapping directly to QueryResultTable
    const columnMapping = toolCall.columnNames || []

    return (
      <>
        <h2 className="text-xl font-semibold text-white">Query Result</h2>

        <QueryResultTable columns={columnMapping} data={rawData} />

        {sqlQuery && (
          <div className="bg-slate-800/30 rounded-lg border border-slate-700/50">
            <Collapsible open={isQueryOpen} onOpenChange={setIsQueryOpen}>
              <CollapsibleTrigger className="w-full flex items-center gap-2 px-4 py-3 text-slate-300 hover:text-white hover:bg-slate-700/30 transition-all duration-200 rounded-t-lg">
                {isQueryOpen ? (
                  <ChevronDown className="h-4 w-4 text-cyan-400" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">SQL Query</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
                <div className="border-t border-slate-700/50 pt-3">
                  <pre className="bg-slate-900/60 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto border border-slate-600/30">
                    <code>{format(sqlQuery, { language: 'sql' })}</code>
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </>
    )
  }

  const toolCallData = {
    id: toolCall.id,
    toolName: toolCall.toolName,
    inputParams: toolCall.inputParams,
    callId: toolCall.callId,
    title: toolCall.title ?? null,
    columnNames: toolCall.columnNames ?? null,
    toolResult: toolCall.toolResult
      ? {
          resultContent: toolCall.toolResult.resultContent,
          success: toolCall.toolResult.success,
          errorMessage: toolCall.toolResult.errorMessage,
        }
      : null,
    sessionId: toolCall.message.sessionId,
    messageId: toolCall.message.id,
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-white">Tool Call Data</h2>
      <pre className="text-slate-300 text-sm overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(toolCallData, null, 2)}
      </pre>
    </>
  )
}
