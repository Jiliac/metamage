import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import SessionView from '@/components/SessionView'
import { SessionData } from '@/types/chat'

interface SessionPageProps {
  params: Promise<{
    id: string
  }>
}

// This page uses ISR - static at build time, revalidated every 30 seconds
export const revalidate = 30

// Generate static paths for all existing sessions at build time
export async function generateStaticParams() {
  const sessions = await prisma.chatSession.findMany({
    select: { id: true },
  })

  return sessions.map(session => ({
    id: session.id,
  }))
}

async function getSessionData(id: string): Promise<SessionData | null> {
  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: {
      messages: {
        include: {
          toolCalls: {
            include: {
              toolResult: true,
            },
          },
        },
        orderBy: {
          sequenceOrder: 'asc',
        },
      },
    },
  })

  if (!session) return null

  return {
    id: session.id,
    provider: session.provider,
    createdAt: session.createdAt.toISOString(),
    messages: session.messages.map(message => ({
      id: message.id,
      messageType: message.messageType,
      content: message.content,
      sequenceOrder: message.sequenceOrder,
      createdAt: message.createdAt.toISOString(),
      toolCalls: message.toolCalls.map(toolCall => ({
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
      })),
    })),
  }
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params
  const session = await getSessionData(id)

  if (!session) {
    notFound()
  }

  return <SessionView initialSession={session} />
}
