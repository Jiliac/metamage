export interface ToolResult {
  resultContent: unknown
  success: boolean
  errorMessage: string | null
}

export interface ToolCall {
  id: string
  toolName: string
  inputParams: unknown
  callId: string
  toolResult: ToolResult | null
}

export interface Message {
  id: string
  messageType: string
  content: string
  sequenceOrder: number
  createdAt: string
  toolCalls?: ToolCall[]
}

export interface SessionData {
  id: string
  provider: string
  createdAt: string
  messages: Message[]
}
