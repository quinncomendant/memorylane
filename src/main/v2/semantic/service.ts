import { OpenRouter } from '@openrouter/sdk'
import log from '../../logger'
import { UsageTracker } from '../../services/usage-tracker'
import type { V2Activity } from '../activity-types'
import type { ActivitySemanticService } from '../activity-transformer-types'
import {
  DEFAULT_SNAPSHOT_MODELS,
  DEFAULT_VIDEO_MODELS,
  MODEL_PRICING_USD_PER_MILLION,
} from './constants'
import { tryLoadVideoAsDataUrl, encodeSnapshots } from './media'
import { buildSemanticPrompt } from './prompt'
import { selectSnapshotFrames } from './sampling'
import type {
  AttemptResult,
  ChatRequest,
  ChatContentItem,
  ChatResponseLike,
  SemanticMode,
  SemanticChatClient,
  V2ActivitySemanticServiceConfig,
  V2SemanticEndpointConfig,
  V2SemanticRunDiagnostics,
} from './types'

export class V2ActivitySemanticService implements ActivitySemanticService {
  private client: SemanticChatClient | null
  private readonly videoModels: string[]
  private readonly snapshotModels: string[]
  private readonly maxSnapshots: number
  private readonly minSnapshotGapMs: number
  private readonly maxVideoBytes: number
  private readonly requestTimeoutMs: number
  private readonly usageTracker: V2ActivitySemanticServiceConfig['usageTracker']
  private readonly debugDumper: V2ActivitySemanticServiceConfig['debugDumper']
  private readonly usesInjectedClient: boolean
  private openRouterApiKey: string | null
  private isCustomEndpoint = false

  private lastRunDiagnostics: V2SemanticRunDiagnostics | null = null

  constructor(apiKey?: string, config?: V2ActivitySemanticServiceConfig) {
    this.videoModels = config?.videoModels?.length
      ? [...config.videoModels]
      : [...DEFAULT_VIDEO_MODELS]
    this.snapshotModels = config?.snapshotModels?.length
      ? [...config.snapshotModels]
      : [...DEFAULT_SNAPSHOT_MODELS]
    this.maxSnapshots = config?.maxSnapshots ?? 6
    this.minSnapshotGapMs = config?.minSnapshotGapMs ?? 20_000
    this.maxVideoBytes = config?.maxVideoBytes ?? 25 * 1024 * 1024
    this.requestTimeoutMs = config?.requestTimeoutMs ?? 45_000
    this.usageTracker = config?.usageTracker ?? new UsageTracker()
    this.debugDumper = config?.debugDumper

    if (!Number.isInteger(this.maxSnapshots) || this.maxSnapshots <= 0) {
      throw new Error('maxSnapshots must be a positive integer')
    }
    if (!Number.isFinite(this.minSnapshotGapMs) || this.minSnapshotGapMs < 0) {
      throw new Error('minSnapshotGapMs must be >= 0')
    }
    if (!Number.isFinite(this.maxVideoBytes) || this.maxVideoBytes <= 0) {
      throw new Error('maxVideoBytes must be > 0')
    }
    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
      throw new Error('requestTimeoutMs must be > 0')
    }

    this.openRouterApiKey = apiKey && apiKey.trim().length > 0 ? apiKey : null
    this.usesInjectedClient = Boolean(config?.client)

    if (config?.client) {
      this.client = config.client
      return
    }

    this.configureClient(config?.endpointConfig ?? null)
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  isUsingCustomEndpoint(): boolean {
    return this.isCustomEndpoint
  }

  updateApiKey(apiKey: string | null): void {
    if (this.usesInjectedClient) {
      log.info('[V2ActivitySemanticService] Ignoring API key update: injected client active')
      return
    }
    if (this.isCustomEndpoint) {
      log.info('[V2ActivitySemanticService] Ignoring API key update: custom endpoint active')
      return
    }

    const normalizedKey = apiKey && apiKey.trim().length > 0 ? apiKey : null
    this.openRouterApiKey = normalizedKey

    if (normalizedKey) {
      delete process.env.OPENROUTER_API_KEY
      this.client = new OpenRouter({ apiKey: normalizedKey }) as unknown as SemanticChatClient
      return
    }

    this.client = null
  }

  updateEndpoint(config: V2SemanticEndpointConfig | null, openRouterKey?: string | null): void {
    if (this.usesInjectedClient) {
      log.info('[V2ActivitySemanticService] Ignoring endpoint update: injected client active')
      return
    }

    if (config) {
      this.isCustomEndpoint = true
      const effectiveKey = config.apiKey ?? ''
      this.client = new OpenRouter({
        apiKey: effectiveKey,
        serverURL: config.serverURL,
      }) as unknown as SemanticChatClient
      return
    }

    this.isCustomEndpoint = false
    const normalizedOpenRouterKey =
      openRouterKey && openRouterKey.trim().length > 0 ? openRouterKey : null
    if (normalizedOpenRouterKey) {
      this.openRouterApiKey = normalizedOpenRouterKey
      this.client = new OpenRouter({
        apiKey: normalizedOpenRouterKey,
      }) as unknown as SemanticChatClient
      return
    }

    if (this.openRouterApiKey) {
      this.client = new OpenRouter({
        apiKey: this.openRouterApiKey,
      }) as unknown as SemanticChatClient
      return
    }

    this.client = null
  }

  async summarizeFromVideo(input: {
    activity: V2Activity
    videoPath: string
    ocrText: string
  }): Promise<string> {
    this.assertInput(input)
    void input.ocrText

    const diagnostics: V2SemanticRunDiagnostics = {
      activityId: input.activity.id,
      promptChars: 0,
      chosenMode: null,
      chosenModel: null,
      fallbackReason: null,
      attempts: [],
      selectedSnapshotPaths: [],
      videoSizeBytes: null,
      videoMimeType: null,
    }
    this.lastRunDiagnostics = diagnostics

    if (!this.client) {
      diagnostics.fallbackReason = 'semantic service is not configured'
      return ''
    }

    const videoPrompt = buildSemanticPrompt(input.activity, 'video')
    diagnostics.promptChars = videoPrompt.length

    const videoAsset = tryLoadVideoAsDataUrl(input.videoPath, this.maxVideoBytes)
    if (videoAsset) {
      diagnostics.videoSizeBytes = videoAsset.sizeBytes
      diagnostics.videoMimeType = videoAsset.mimeType

      const videoResult = await this.tryModelChain({
        mode: 'video',
        models: this.videoModels,
        prompt: videoPrompt,
        diagnostics,
        buildContent: () => [
          { type: 'text', text: videoPrompt },
          { type: 'input_video', videoUrl: { url: videoAsset.dataUrl } },
        ],
      })

      if (videoResult) {
        diagnostics.chosenMode = 'video'
        diagnostics.chosenModel = videoResult.model
        return videoResult.summary
      }

      diagnostics.fallbackReason = 'all video models failed'
    } else {
      diagnostics.fallbackReason = 'video unavailable or exceeds configured size limit'
    }

    const selectedSnapshots = selectSnapshotFrames({
      frames: input.activity.frames,
      maxSnapshots: this.maxSnapshots,
      minSnapshotGapMs: this.minSnapshotGapMs,
    })
    diagnostics.selectedSnapshotPaths = selectedSnapshots.map((frame) => frame.frame.filepath)

    if (selectedSnapshots.length === 0) {
      return ''
    }

    const encodedSnapshots = await encodeSnapshots({
      frames: selectedSnapshots,
      onEncodeError: ({ filepath, error }) => {
        log.warn(
          '[V2ActivitySemanticService] Failed to encode snapshot frame',
          JSON.stringify({ filepath, error: this.describeError(error) }),
        )
      },
    })
    if (encodedSnapshots.length === 0) {
      return ''
    }

    const snapshotPrompt = buildSemanticPrompt(input.activity, 'snapshot')
    const snapshotResult = await this.tryModelChain({
      mode: 'snapshot',
      models: this.snapshotModels,
      prompt: snapshotPrompt,
      diagnostics,
      buildContent: () => {
        const content: ChatContentItem[] = [{ type: 'text', text: snapshotPrompt }]
        for (const image of encodedSnapshots) {
          content.push({
            type: 'image_url',
            imageUrl: { url: image.dataUrl, detail: 'high' },
          })
        }
        return content
      },
    })

    if (snapshotResult) {
      diagnostics.chosenMode = 'snapshot'
      diagnostics.chosenModel = snapshotResult.model
      return snapshotResult.summary
    }

    if (!diagnostics.fallbackReason) {
      diagnostics.fallbackReason = 'all snapshot models failed'
    }

    return ''
  }

  getLastRunDiagnostics(): V2SemanticRunDiagnostics | null {
    if (!this.lastRunDiagnostics) return null
    return {
      ...this.lastRunDiagnostics,
      attempts: this.lastRunDiagnostics.attempts.map((attempt) => ({ ...attempt })),
      selectedSnapshotPaths: [...this.lastRunDiagnostics.selectedSnapshotPaths],
    }
  }

  private assertInput(input: { activity: V2Activity; videoPath: string; ocrText: string }): void {
    if (!input.activity || typeof input.activity !== 'object') {
      throw new Error('summarizeFromVideo requires a valid activity object')
    }
    if (!input.activity.id || input.activity.id.trim().length === 0) {
      throw new Error('summarizeFromVideo requires activity.id')
    }
    if (typeof input.videoPath !== 'string' || input.videoPath.trim().length === 0) {
      throw new Error('summarizeFromVideo requires a non-empty videoPath')
    }
  }

  private async tryModelChain(params: {
    mode: SemanticMode
    models: string[]
    prompt: string
    diagnostics: V2SemanticRunDiagnostics
    buildContent: (model: string) => ChatContentItem[]
  }): Promise<AttemptResult | null> {
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
      const requestJson = this.safeStringify(request)
      const startedAt = Date.now()

      try {
        const response = (await this.withTimeout(
          this.client!.chat.send(request),
          this.requestTimeoutMs,
          `semantic model request timed out after ${this.requestTimeoutMs}ms`,
        )) as ChatResponseLike

        const responseJson = this.safeStringify(response)
        const summary = this.extractSummary(response)
        const usage = this.extractUsage(response)
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

          this.dumpRoundTripSafe({
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

        this.recordUsageSafe({
          model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        })

        this.dumpRoundTripSafe({
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
        const detail = this.describeError(error)

        params.diagnostics.attempts.push({
          mode: params.mode,
          model,
          durationMs,
          success: false,
          error: detail,
        })

        this.dumpRoundTripSafe({
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
      }
    }

    return null
  }

  private extractSummary(response: ChatResponseLike): string {
    const content = response.choices?.[0]?.message?.content

    if (typeof content === 'string') {
      return content.trim()
    }

    if (Array.isArray(content)) {
      const textParts = content
        .map((part) => {
          if (!part || typeof part !== 'object') return ''
          const maybeText = (part as { text?: unknown }).text
          return typeof maybeText === 'string' ? maybeText : ''
        })
        .filter((value) => value.length > 0)

      return textParts.join(' ').trim()
    }

    return ''
  }

  private extractUsage(response: ChatResponseLike): {
    promptTokens: number
    completionTokens: number
  } {
    const usage = response.usage
    if (!usage) {
      return {
        promptTokens: 0,
        completionTokens: 0,
      }
    }

    const promptTokens = usage.promptTokens ?? usage.prompt_tokens ?? 0
    const completionTokens = usage.completionTokens ?? usage.completion_tokens ?? 0

    return {
      promptTokens,
      completionTokens,
    }
  }

  private recordUsageSafe(input: {
    model: string
    promptTokens: number
    completionTokens: number
  }): void {
    const pricing = MODEL_PRICING_USD_PER_MILLION[input.model]
    const cost =
      pricing === undefined
        ? 0
        : (input.promptTokens / 1_000_000) * pricing.input_tokens_per_million +
          (input.completionTokens / 1_000_000) * pricing.completion_tokens_per_million

    try {
      this.usageTracker?.recordUsage({
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        cost,
      })
    } catch (error) {
      log.warn(
        '[V2ActivitySemanticService] Usage tracking failed',
        JSON.stringify({
          model: input.model,
          error: this.describeError(error),
        }),
      )
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
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

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  }

  private safeStringify(value: unknown): string {
    try {
      return `${JSON.stringify(value, null, 2)}\n`
    } catch (error) {
      return `${JSON.stringify({ error: this.describeError(error) }, null, 2)}\n`
    }
  }

  private dumpRoundTripSafe(input: {
    activityId: string
    mode: SemanticMode
    model: string
    startedAt: number
    durationMs: number
    success: boolean
    request: ChatRequest
    requestJson: string
    responseJson?: string
    summary?: string
    error?: string
  }): void {
    try {
      this.debugDumper?.dumpRoundTrip(input)
    } catch (error) {
      log.warn(
        '[V2ActivitySemanticService] Debug dump failed',
        JSON.stringify({
          activityId: input.activityId,
          mode: input.mode,
          model: input.model,
          error: this.describeError(error),
        }),
      )
    }
  }

  private configureClient(endpointConfig: V2SemanticEndpointConfig | null): void {
    if (endpointConfig) {
      const effectiveKey = endpointConfig.apiKey ?? this.openRouterApiKey ?? ''
      this.isCustomEndpoint = true
      this.client = new OpenRouter({
        apiKey: effectiveKey,
        serverURL: endpointConfig.serverURL,
      }) as unknown as SemanticChatClient
      return
    }

    this.isCustomEndpoint = false
    if (this.openRouterApiKey) {
      this.client = new OpenRouter({
        apiKey: this.openRouterApiKey,
      }) as unknown as SemanticChatClient
      return
    }

    this.client = null
    log.warn(
      '[V2ActivitySemanticService] No API key/client configured - semantic summarization disabled',
    )
  }
}
