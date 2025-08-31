import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url)
    const includeToolCalls = searchParams.get('includeToolCalls') === 'true'

    const { id } = await params
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: {
        messages: {
          include: {
            toolCalls: {
              include: {
                toolResult: includeToolCalls,
              },
            },
          },
          orderBy: {
            sequenceOrder: 'asc',
          },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const formattedSession = {
      id: session.id,
      provider: session.provider,
      title: session.title ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messages: session.messages.map(message => ({
        id: message.id,
        messageType: message.messageType,
        content: message.content,
        sequenceOrder: message.sequenceOrder,
        createdAt: message.createdAt.toISOString(),
        ...(includeToolCalls && {
          toolCalls: message.toolCalls.map(toolCall => ({
            id: toolCall.id,
            toolName: toolCall.toolName,
            inputParams: toolCall.inputParams,
            callId: toolCall.callId,
            title: toolCall.title ?? null,
            columnNames: toolCall.columnNames ?? null,
            createdAt: toolCall.createdAt.toISOString(),
            toolResult:
              includeToolCalls && toolCall.toolResult
                ? {
                    id: toolCall.toolResult.id,
                    resultContent: toolCall.toolResult.resultContent,
                    success: toolCall.toolResult.success,
                    errorMessage: toolCall.toolResult.errorMessage,
                    createdAt: toolCall.toolResult.createdAt.toISOString(),
                  }
                : null,
          })),
        }),
      })),
    }

    return NextResponse.json(formattedSession)
  } catch (error) {
    console.error('Error fetching session:', error)
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    )
  }
}
