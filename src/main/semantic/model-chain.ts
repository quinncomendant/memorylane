import log from '../logger'
import {
  describeSemanticError,
  extractSemanticSummary,
  extractSemanticUsage,
  safeJsonStringify,
} from './response-utils'
import type {
  AttemptResult,
  ChatContentItem,
  ChatRequest,
  ChatResponseLike,
  SemanticChatClient,
  SemanticMode,
  V2SemanticRoundTripDump,
  V2SemanticRunDiagnostics,
} from './types'

export interface TrySemanticModelChainParams {
  client: SemanticChatClient
  requestTimeoutMs: number
  mode: SemanticMode
  models: string[]
  prompt: string
  diagnostics: V2SemanticRunDiagnostics
  buildContent: (model: string) => ChatContentItem[]
  onRecordUsage(input: { model: string; promptTokens: number; completionTokens: number }): void
  onDumpRoundTrip(input: V2SemanticRoundTripDump): void
  onAttemptFailed?(input: { mode: SemanticMode; model: string; error: string }): void
}

export async function trySemanticModelChain(
  params: TrySemanticModelChainParams,
): Promise<AttemptResult | null> {
  if (params.models.length === 0) {
    return null
  }

  for (const model of params.models) {
    const request: ChatRequest = {
      model,
      messages: [
        {
          role: 'user',
          content: params.buildContent(model),
        },
      ],
    }
    const requestJson = safeJsonStringify(request)
    const startedAt = Date.now()

    try {
      const response = (await withTimeout(
        params.client.chat.send(request),
        params.requestTimeoutMs,
        `semantic model request timed out after ${params.requestTimeoutMs}ms`,
      )) as ChatResponseLike

      const responseJson = safeJsonStringify(response)
      const summary = extractSemanticSummary(response)
      const usage = extractSemanticUsage(response)
      const durationMs = Date.now() - startedAt

      if (summary.length === 0) {
        params.diagnostics.attempts.push({
          mode: params.mode,
          model,
          durationMs,
          success: false,
          error: 'empty summary',
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        })

        params.onDumpRoundTrip({
          activityId: params.diagnostics.activityId,
          mode: params.mode,
          model,
          startedAt,
          durationMs,
          success: false,
          request,
          error: 'empty summary',
          requestJson,
          responseJson,
          summary,
        })
        continue
      }

      params.diagnostics.attempts.push({
        mode: params.mode,
        model,
        durationMs,
        success: true,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      })

      params.onRecordUsage({
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      })

      params.onDumpRoundTrip({
        activityId: params.diagnostics.activityId,
        mode: params.mode,
        model,
        startedAt,
        durationMs,
        success: true,
        request,
        requestJson,
        responseJson,
        summary,
      })

      log.info(
        '[V2ActivitySemanticService] Semantic summary succeeded',
        JSON.stringify({
          activityId: params.diagnostics.activityId,
          mode: params.mode,
          model,
          durationMs,
          promptChars: params.prompt.length,
          attemptsSoFar: params.diagnostics.attempts.length,
        }),
      )

      return { summary, model }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const detail = describeSemanticError(error)

      params.diagnostics.attempts.push({
        mode: params.mode,
        model,
        durationMs,
        success: false,
        error: detail,
      })

      params.onDumpRoundTrip({
        activityId: params.diagnostics.activityId,
        mode: params.mode,
        model,
        startedAt,
        durationMs,
        success: false,
        request,
        requestJson,
        error: detail,
      })

      log.warn(
        '[V2ActivitySemanticService] Semantic attempt failed',
        JSON.stringify({
          activityId: params.diagnostics.activityId,
          mode: params.mode,
          model,
          durationMs,
          error: detail,
        }),
      )

      params.onAttemptFailed?.({
        mode: params.mode,
        model,
        error: detail,
      })
    }
  }

  return null
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}
