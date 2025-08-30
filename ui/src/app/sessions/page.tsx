import { prisma } from '@/lib/prisma'
import Link from 'next/link'


// This page uses ISR to regenerate every 60 seconds
export const revalidate = 60

async function getSessionsWithCounts() {
  const sessions = await prisma.chatSession.findMany({
    select: {
      id: true,
      provider: true,
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
  })

  return sessions.map((session) => ({
    id: session.id,
    provider: session.provider,
    createdAt: session.createdAt.toISOString(),
    messageCount: session._count.messages,
    lastMessage: session.messages[0]?.content.substring(0, 100) || null,
  }))
}

export default async function SessionsPage() {
  const sessions = await getSessionsWithCounts()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Chat <span className="text-cyan-400">Sessions</span>
          </h1>
          <p className="text-slate-300">
            MTG Tournament Analysis Conversations
          </p>
        </div>

        <div className="grid gap-4">
          {sessions.length === 0 ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center">
              <div className="text-4xl mb-4">🃏</div>
              <h2 className="text-xl font-semibold text-white mb-2">No Sessions Yet</h2>
              <p className="text-slate-400">
                Start a chat with your MTG analysis agent to see sessions here.
              </p>
            </div>
          ) : (
            sessions.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block bg-slate-800/50 hover:bg-slate-800/70 border border-slate-700 hover:border-slate-600 rounded-lg p-6 transition-all duration-200"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Session {session.id.substring(0, 8)}...
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <span>{session.messageCount} messages</span>
                      <span>
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {session.lastMessage && (
                  <p className="text-slate-300 text-sm line-clamp-2">
                    {session.lastMessage}
                    {session.lastMessage.length >= 100 && '...'}
                  </p>
                )}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
