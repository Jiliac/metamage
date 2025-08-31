import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const sessions = await prisma.chatSession.findMany({
      select: {
        id: true,
        provider: true,
        title: true,
        createdAt: true,
        messages: {
          select: {
            content: true,
            messageType: true,
            createdAt: true,
          },
          orderBy: {
            sequenceOrder: 'desc',
          },
          take: 1,
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    })

    const formattedSessions = sessions.map(session => ({
      id: session.id,
      provider: session.provider,
      title: session.title || null,
      createdAt: session.createdAt.toISOString(),
      messageCount: session._count.messages,
      lastMessage: session.messages[0]?.content.substring(0, 100) || null,
    }))

    return NextResponse.json({
      sessions: formattedSessions,
      hasMore: sessions.length === limit,
    })
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    )
  }
}
