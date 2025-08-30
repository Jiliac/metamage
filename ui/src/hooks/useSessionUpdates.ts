'use client'

import { useState, useEffect, useCallback } from 'react'

import { Message } from '@/types/chat'

interface UseSessionUpdatesOptions {
  sessionId: string
  initialMessages: Message[]
  pollingInterval?: number
  includeToolCalls?: boolean
}

export function useSessionUpdates({
  sessionId,
  initialMessages,
  pollingInterval = 10000, // 10 seconds default
  includeToolCalls = true,
}: UseSessionUpdatesOptions) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [lastChecked, setLastChecked] = useState<string>(new Date().toISOString())
  const [isPolling, setIsPolling] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNewMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        since: lastChecked,
        includeToolCalls: includeToolCalls.toString(),
      })

      const response = await fetch(`/api/sessions/${sessionId}/messages?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch new messages')
      }

      const data = await response.json()
      
      if (data.messages && data.messages.length > 0) {
        setMessages(prev => {
          // Merge new messages with existing ones, avoiding duplicates
          const existingIds = new Set(prev.map(m => m.id))
          const newMessages = data.messages.filter((m: Message) => !existingIds.has(m.id))
          
          if (newMessages.length > 0) {
            return [...prev, ...newMessages].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
          }
          return prev
        })
      }
      
      setLastChecked(data.timestamp)
      setError(null)
    } catch (err) {
      console.error('Error fetching new messages:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [sessionId, lastChecked, includeToolCalls])

  useEffect(() => {
    if (!isPolling) return

    const interval = setInterval(fetchNewMessages, pollingInterval)
    return () => clearInterval(interval)
  }, [fetchNewMessages, pollingInterval, isPolling])

  const startPolling = () => setIsPolling(true)
  const stopPolling = () => setIsPolling(false)
  const forceRefresh = () => fetchNewMessages()

  return {
    messages,
    isPolling,
    error,
    startPolling,
    stopPolling,
    forceRefresh,
  }
}