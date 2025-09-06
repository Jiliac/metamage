import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ToolResultView } from '@/components/ToolResultView'
import type { Metadata } from 'next'
import {
  renderSuccinctContent,
  labelizeToolName,
  summarizeToolCall,
  SUCCINCT_TOOLS,
} from '@/components/toolCallUtils'

interface ToolPageProps {
  params: Promise<{
    id: string
  }>
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
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

  if (!toolCall) {
    return {
      title: 'Tool Call Not Found',
      description: 'Requested tool call could not be found.',
      alternates: { canonical: `/tool/${id}` },
    }
  }

  const isSuccinct = SUCCINCT_TOOLS.has(toolCall.toolName)
  const title = isSuccinct
    ? `${labelizeToolName(toolCall.toolName)}: ${summarizeToolCall({
        ...toolCall,
        columnNames: Array.isArray(toolCall.columnNames)
          ? (toolCall.columnNames as string[])
          : null,
      })}`
    : `Tool Call – ${toolCall.toolName}`

  return {
    title,
    description: `Details for ${toolCall.toolName}.`,
    alternates: { canonical: `/tool/${id}` },
    openGraph: {
      url: `/tool/${id}`,
      title,
      description: `Details for ${toolCall.toolName}.`,
      images: ['/logo.png'],
    },
    twitter: {
      card: 'summary_large_image',
    },
  }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-6 py-8 max-w-5xl pt-20">
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
              {SUCCINCT_TOOLS.has(toolCall.toolName) ? (
                <>
                  {labelizeToolName(toolCall.toolName)}:{' '}
                  <span className="text-slate-200">
                    {summarizeToolCall({
                      ...toolCall,
                      columnNames: Array.isArray(toolCall.columnNames)
                        ? (toolCall.columnNames as string[])
                        : null,
                    })}
                  </span>
                </>
              ) : (
                <>
                  Tool Call{' '}
                  <span className="text-cyan-400">{toolCall.toolName}</span>
                </>
              )}
            </h1>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-6 space-y-4">
          {SUCCINCT_TOOLS.has(toolCall.toolName) ? (
            renderSuccinctContent({
              ...toolCall,
              columnNames: Array.isArray(toolCall.columnNames)
                ? (toolCall.columnNames as string[])
                : null,
            })
          ) : (
            <ToolResultView toolCall={toolCall} />
          )}
        </div>
      </div>
    </div>
  )
}
