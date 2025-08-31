import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import QueryResultTable from '@/components/QueryResultTable'

interface ToolPageProps {
  params: Promise<{
    id: string
  }>
}

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

async function getToolCallData(id: string) {
  const toolCall = await prisma.toolCall.findUnique({
    where: { id },
    include: {
      toolResult: true,
      message: {
        include: {
          session: true,
        },
      },
    },
  })

  return toolCall
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { id } = await params
  const toolCall = await getToolCallData(id)

  if (!toolCall) {
    notFound()
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-6 py-8 max-w-4xl pt-20">
        <div className="mb-6">
          <Link
            href={`/sessions/${toolCall.message.sessionId}`}
            className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-block"
          >
            ← Back to Session
            {toolCall.message.session.title &&
              `: ${toolCall.message.session.title}`}
          </Link>

          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-white">
              Tool Call{' '}
              <span className="text-cyan-400">{toolCall.toolName}</span>
            </h1>
          </div>

          <div className="text-sm text-slate-400">
            ID: {toolCall.id.substring(0, 8)}...
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-6 space-y-4">
          {toolCall.toolName === 'query_database' &&
            Array.isArray(toolCall.columnNames) &&
            (toolCall.columnNames as unknown[]).length > 0 &&
            toolCall.toolResult && (
              <>
                <h2 className="text-xl font-semibold text-white">
                  Query Result
                </h2>
                <QueryResultTable
                  columns={(toolCall.columnNames as unknown[]).map(String)}
                  data={normalizeRows(
                    toolCall.toolResult.resultContent,
                    (toolCall.columnNames as unknown[]).map(String)
                  )}
                />
              </>
            )}

          <h2 className="text-xl font-semibold text-white">Tool Call Data</h2>
          <pre className="text-slate-300 text-sm overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(toolCallData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
