import Link from 'next/link'
import { SessionData, Message, ToolCall } from '@/types/chat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SessionViewProps {
  initialSession: SessionData
}

type Turn = {
  user: Message
  agentMessages: Message[]
  toolCalls: ToolCall[]
  startedAt: string
}

function labelizeToolName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
        toolCalls: m.toolCalls ?? [],
        startedAt: m.createdAt,
      }
    } else {
      if (!current) continue
      if (m.toolCalls?.length) current.toolCalls.push(...m.toolCalls)
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
              Session{' '}
              <span className="text-cyan-400">
                {initialSession.id.substring(0, 8)}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>{turns.length} requests</span>
            <span>
              Started {new Date(initialSession.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {turns.map((turn, idx) => {
            const agentMarkdown =
              turn.agentMessages.length > 0
                ? turn.agentMessages.map(m => m.content).join('\n\n')
                : ''

            return (
              <Card
                key={turn.user.id}
                className="bg-slate-800/50 border-slate-700"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💬</span>
                    <CardTitle className="text-base font-semibold text-white">
                      User
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="text-slate-400 border-slate-600"
                    >
                      #{idx + 1}
                    </Badge>
                    <span className="text-xs text-slate-500 ml-auto">
                      {new Date(turn.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="text-slate-300 whitespace-pre-wrap mb-4">
                    {turn.user.content}
                  </div>

                  {turn.toolCalls.length > 0 && (
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-slate-400 mb-2">
                        Tools used
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {turn.toolCalls.map(tc => (
                          <Badge
                            key={tc.id}
                            variant="secondary"
                            className="font-mono text-yellow-300 bg-yellow-900/20 border border-yellow-700"
                            title={tc.toolName}
                          >
                            {labelizeToolName(tc.toolName)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🤖</span>
                      <span className="text-white font-semibold">
                        Assistant
                      </span>
                    </div>

                    {agentMarkdown ? (
                      <div className="prose">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {agentMarkdown}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-slate-400 text-sm italic">
                        Working on it…
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
