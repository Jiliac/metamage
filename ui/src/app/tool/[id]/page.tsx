import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'

interface ToolPageProps {
  params: Promise<{
    id: string
  }>
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

        <div className="bg-slate-800/50 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Tool Call Data
          </h2>
          <pre className="text-slate-300 text-sm overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(toolCallData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
