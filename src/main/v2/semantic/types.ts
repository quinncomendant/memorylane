import type { V2ActivityFrame } from '../activity-types'

export type SemanticMode = 'video' | 'snapshot'

export type ChatContentItem =
  | { type: 'text'; text: string }
  | { type: 'input_video'; videoUrl: { url: string } }
  | { type: 'image_url'; imageUrl: { url: string; detail: 'high' } }

export interface ChatRequest {
  model: string
  messages: Array<{
    role: 'user'
    content: ChatContentItem[]
  }>
}

export interface SemanticChatClient {
  chat: {
    send(request: ChatRequest): Promise<unknown>
  }
}

export interface ChatResponseLike {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
  usage?: {
    promptTokens?: number
    completionTokens?: number
    prompt_tokens?: number
    completion_tokens?: number
  }
}

export interface UsageTrackerLike {
  recordUsage(usage: { prompt_tokens: number; completion_tokens: number; cost?: number }): void
}

export interface EncodedImage {
  frame: V2ActivityFrame
  dataUrl: string
}

export interface AttemptResult {
  summary: string
  model: string
}

export interface VideoAssetData {
  dataUrl: string
  sizeBytes: number
  mimeType: string
}

export interface V2SemanticEndpointConfig {
  serverURL: string
  apiKey?: string
}

export interface V2ActivitySemanticServiceConfig {
  videoModels?: string[]
  snapshotModels?: string[]
  maxSnapshots?: number
  minSnapshotGapMs?: number
  maxVideoBytes?: number
  requestTimeoutMs?: number
  usageTracker?: UsageTrackerLike
  client?: SemanticChatClient
  endpointConfig?: V2SemanticEndpointConfig
}

export interface V2SemanticAttempt {
  mode: SemanticMode
  model: string
  durationMs: number
  success: boolean
  error?: string
  promptTokens?: number
  completionTokens?: number
}

export interface V2SemanticRunDiagnostics {
  activityId: string
  promptChars: number
  chosenMode: SemanticMode | null
  chosenModel: string | null
  fallbackReason: string | null
  attempts: V2SemanticAttempt[]
  selectedSnapshotPaths: string[]
  videoSizeBytes: number | null
  videoMimeType: string | null
}
