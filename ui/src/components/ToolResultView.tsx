import QueryResultTable from '@/components/QueryResultTable'
import { Prisma } from '@prisma/client'
//
// Normalize various resultContent shapes into array of row objects using provided column order
function normalizeRows(
  resultContent: unknown,
  columnNames: string[]
): Array<Record<string, unknown>> {
  const extractArray = (rc: unknown): unknown[] => {
    if (Array.isArray(rc)) return rc
    if (typeof rc === 'object' && rc !== null) {
      const obj = rc as { rows?: unknown; data?: unknown }
      if (Array.isArray(obj.rows)) return obj.rows
      if (Array.isArray(obj.data)) return obj.data
    }
    return []
  }

  const raw = extractArray(resultContent)

  return raw.map(row => {
    if (Array.isArray(row)) {
      const obj: Record<string, unknown> = {}
      columnNames.forEach((col, i) => {
        obj[col] = row[i]
      })
      return obj
    }
    if (typeof row === 'object' && row !== null) {
      const ro = row as Record<string, unknown>
      const obj: Record<string, unknown> = {}
      columnNames.forEach(col => {
        obj[col] = ro[col]
      })
      return obj
    }
    return { value: row as unknown }
  })
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
  if (toolCall.toolName === 'query_database' && toolCall.toolResult) {
    return (
      <>
        <h2 className="text-xl font-semibold text-white">Query Result</h2>
        <QueryResultTable
          columns={(toolCall.columnNames as unknown[]).map(String)}
          data={normalizeRows(
            toolCall.toolResult.resultContent,
            (toolCall.columnNames as unknown[]).map(String)
          )}
        />
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
