import Link from 'next/link'
import { SessionData, Message } from '@/types/chat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToolCallItem } from './ToolCallItem'

interface SessionViewProps {
  initialSession: SessionData
}

type Turn = {
  user: Message
  agentMessages: Message[]
  startedAt: string
}

function groupIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = []
  let current: Turn | null = null

  for (const m of messages) {
    if (m.messageType === 'user') {
      if (current) turns.push(current)
      current = {
        user: m,
        agentMessages: [],
        startedAt: m.createdAt,
      }
    } else {
      if (!current) continue
      // tool calls shown inline per message
      if (
        m.messageType === 'agent_thought' ||
        m.messageType === 'agent_final'
      ) {
        current.agentMessages.push(m)
      }
    }
  }
  if (current) turns.push(current)
  return turns
}

export default function SessionView({ initialSession }: SessionViewProps) {
  const turns = groupIntoTurns(initialSession.messages)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-6 py-8 max-w-4xl pt-20">
        <div className="mb-6">
          <Link
            href="/sessions"
            className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-block"
          >
            ← Back to Sessions
          </Link>

          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-white">
              {initialSession.title ? (
                <>{initialSession.title}</>
              ) : (
                <>
                  Session{' '}
                  <span className="text-cyan-400">
                    {initialSession.id.substring(0, 8)}
                  </span>
                </>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>{turns.length} requests</span>
            <span>
              Started {new Date(initialSession.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          {turns.map(turn => {
            return (
              <div key={turn.user.id} className="space-y-4">
                {/* User message - right aligned */}
                <div className="flex justify-end mr-4 my-7">
                  <div className="bg-slate-700 rounded-2xl px-5 py-4 max-w-3xl">
                    <div className="text-slate-100 whitespace-pre-wrap">
                      {turn.user.content}
                    </div>
                  </div>
                </div>

                {/* Assistant response - left aligned, no border */}
                <div className="space-y-3">
                  {turn.agentMessages.filter(
                    m => m.messageType === 'agent_thought'
                  ).length > 0 ? (
                    <div className="space-y-3">
                      {turn.agentMessages
                        .filter(m => m.messageType === 'agent_thought')
                        .map(m => (
                          <div key={m.id}>
                            <div className="prose mb-2">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {m.content}
                              </ReactMarkdown>
                            </div>

                            {m.toolCalls?.map(tc => (
                              <ToolCallItem key={tc.id} tc={tc} />
                            ))}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm italic">
                      Working on it…
                    </div>
                  )}

                  {turn.agentMessages.find(
                    m => m.messageType === 'agent_final'
                  ) && (
                    <div className="prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {
                          turn.agentMessages.find(
                            m => m.messageType === 'agent_final'
                          )!.content
                        }
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
