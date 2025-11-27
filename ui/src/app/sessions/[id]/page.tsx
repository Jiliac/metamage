import type { Metadata } from 'next'
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  const session = await prisma.chatSession.findUnique({
    where: { id },
    select: {
      id: true,
      provider: true,
      title: true,
      createdAt: true,
      messages: {
        select: { content: true, messageType: true },
        orderBy: { sequenceOrder: 'desc' },
        take: 1,
      },
    },
  })

  const title = session
    ? `${session.title ?? `Session ${session.id.slice(0, 8)}`}`
    : 'Session Not Found'
  const description =
    session?.messages[0]?.content?.slice(0, 160) ||
    'Chat session details and transcript.'

  return {
    title,
    description,
    alternates: { canonical: `/sessions/${id}` },
    openGraph: {
      url: `/sessions/${id}`,
      title,
      description,
      images: ['/logo.png'],
    },
    twitter: {
      card: 'summary_large_image',
    },
  }
}

// Generate static paths for the 100 most recent sessions at build time
export async function generateStaticParams() {
  const sessions = await prisma.chatSession.findMany({
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
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
    title: session.title ?? null,
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
        title: toolCall.title ?? null,
        columnNames:
          Array.isArray(toolCall.columnNames) &&
          toolCall.columnNames.every(item => typeof item === 'string')
            ? (toolCall.columnNames as string[])
            : null,
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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const excerpt =
    session.messages
      .find(m => m.messageType === 'user')
      ?.content?.slice(0, 160) ||
    session.messages[0]?.content?.slice(0, 160) ||
    ''
  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${baseUrl}/sessions/${session.id}`,
    name: session.title
      ? `${session.title} – ${session.provider}`
      : `Chat Session ${session.id.slice(0, 8)} – ${session.provider}`,
    datePublished: session.createdAt,
    description: excerpt,
  }

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />
      <SessionView initialSession={session} />
    </>
  )
}
