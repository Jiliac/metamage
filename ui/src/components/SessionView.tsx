'use client'

import { useSessionUpdates } from '@/hooks/useSessionUpdates'
import Link from 'next/link'
import { SessionData, Message } from '@/types/chat'

interface SessionViewProps {
  initialSession: SessionData
}

function MessageComponent({ message }: { message: Message }) {
  const getMessageIcon = () => {
    switch (message.messageType) {
      case 'user':
        return '💬'
      case 'agent_thought':
        return '💭'
      case 'agent_final':
        return '🤖'
      default:
        return '📝'
    }
  }

  const getMessageBg = () => {
    switch (message.messageType) {
      case 'user':
        return 'bg-blue-900/20 border-blue-700'
      case 'agent_thought':
        return 'bg-purple-900/20 border-purple-700'
      case 'agent_final':
        return 'bg-cyan-900/20 border-cyan-700'
      default:
        return 'bg-slate-800/50 border-slate-700'
    }
  }

  return (
    <div className={`border rounded-lg p-4 ${getMessageBg()}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{getMessageIcon()}</span>
        <span className="font-semibold text-white capitalize">
          {message.messageType.replace('_', ' ')}
        </span>
        <span className="text-sm text-slate-400">
          #{message.sequenceOrder}
        </span>
        <span className="text-xs text-slate-500 ml-auto">
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="text-slate-300 whitespace-pre-wrap mb-3">
        {message.content}
      </div>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-400">Tool Calls:</h4>
          {message.toolCalls.map((toolCall) => (
            <div key={toolCall.id} className="bg-slate-900/50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-yellow-400">🔧</span>
                <span className="font-mono text-yellow-300">{toolCall.toolName}</span>
                <span className="text-xs text-slate-500">({toolCall.callId})</span>
              </div>

              <details className="mb-2">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
                  Input Parameters
                </summary>
                <pre className="text-xs text-slate-400 mt-2 overflow-x-auto">
                  {JSON.stringify(toolCall.inputParams, null, 2)}
                </pre>
              </details>

              {toolCall.toolResult && (
                <div className={`p-2  ${!toolCall.toolResult.success && 'rounded bg-red-900/20'}`}>
                  {!toolCall.toolResult.success && (<div className="flex items-center gap-2 mb-1">
                    <span>❌</span>
                    <span className="text-xs font-semibold">Error</span>
                  </div>)}

                  {toolCall.toolResult.errorMessage && (
                    <p className="text-red-400 text-xs mb-2">
                      {toolCall.toolResult.errorMessage}
                    </p>
                  )}

                  <details>
                    <summary className="cursor-pointer text-slate-400 hover:text-slate-300 text-xs">
                      Result Content
                    </summary>
                    <pre className="text-xs text-slate-400 mt-1 overflow-x-auto max-h-32 overflow-y-auto">
                      {JSON.stringify(toolCall.toolResult.resultContent, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SessionView({ initialSession }: SessionViewProps) {
  const { messages, error } =
    useSessionUpdates({
      sessionId: initialSession.id,
      initialMessages: initialSession.messages,
      pollingInterval: 5000, // 5 seconds for more responsive updates
    })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <Link
            href="/sessions"
            className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-block"
          >
            ← Back to Sessions
          </Link>

          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-white">
              Session <span className="text-cyan-400">{initialSession.id.substring(0, 8)}</span>
            </h1>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>{messages.length} messages</span>
            <span>Started {new Date(initialSession.createdAt).toLocaleString()}</span>
          </div>

          {error && (
            <div className="mt-2 text-red-400 text-sm">
              Error: {error}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {messages.map((message) => (
            <MessageComponent key={message.id} message={message} />
          ))}
        </div>
      </div>
    </div>
  )
}
