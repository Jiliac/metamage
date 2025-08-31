import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { ChatMessage, ToolCall, ToolResult } from '@prisma/client'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since') // ISO timestamp to get messages after this time
    const includeToolCalls = searchParams.get('includeToolCalls') === 'true'

    // Build where clause for filtering by timestamp if provided
    const { id } = await params
    const whereClause: { sessionId: string; createdAt?: { gt: Date } } = {
      sessionId: id,
    }
    if (since) {
      whereClause.createdAt = {
        gt: new Date(since),
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where: whereClause,
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
    })

    const formattedMessages = messages.map(
      (
        message: ChatMessage & {
          toolCalls: (ToolCall & { toolResult: ToolResult | null })[]
        }
      ) => ({
        id: message.id,
        messageType: message.messageType,
        content: message.content,
        sequenceOrder: message.sequenceOrder,
        createdAt: message.createdAt.toISOString(),
        ...(includeToolCalls && {
          toolCalls: message.toolCalls.map(
            (toolCall: ToolCall & { toolResult: ToolResult | null }) => ({
              id: toolCall.id,
              toolName: toolCall.toolName,
              inputParams: toolCall.inputParams,
              callId: toolCall.callId,
              title: (toolCall as any).title ?? null,
              columnNames: (toolCall as any).columnNames ?? null,
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
            })
          ),
        }),
      })
    )

    return NextResponse.json({
      messages: formattedMessages,
      sessionId: id,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}
