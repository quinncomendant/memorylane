import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { V2Activity, V2ActivityFrame } from './activity-types'
import { V2ActivitySemanticService } from './activity-semantic-service'

vi.mock('../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(async () => Buffer.from('mock-jpeg-bytes')),
  })),
}))

const mockSend = vi.fn()
vi.mock('@openrouter/sdk', () => ({
  OpenRouter: vi.fn().mockImplementation(function () {
    return { chat: { send: mockSend } }
  }),
}))

import { OpenRouter } from '@openrouter/sdk'

const DEFAULT_VIDEO_MODELS = [
  'google/gemini-2.5-flash-lite-preview-09-2025',
  'google/gemini-3-flash-preview',
  'allenai/molmo-2-8b',
]

const DEFAULT_SNAPSHOT_MODELS = [
  'mistralai/mistral-small-3.2-24b-instruct',
  'google/gemini-2.5-flash-lite',
]

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'v2-semantic-test-'))
}

function createVideoFile(dir: string, name = 'activity.mp4'): string {
  const filepath = path.join(dir, name)
  fs.writeFileSync(filepath, 'fake-video-binary')
  return filepath
}

function createImageFile(dir: string, name: string): string {
  const filepath = path.join(dir, name)
  fs.writeFileSync(filepath, 'fake-image-binary')
  return filepath
}

function makeFrame(filepath: string, timestamp: number, sequenceNumber: number): V2ActivityFrame {
  return {
    offset: sequenceNumber,
    frame: {
      filepath,
      timestamp,
      width: 1280,
      height: 720,
      displayId: 1,
      sequenceNumber,
    },
  }
}

function makeActivity(params?: {
  id?: string
  startTimestamp?: number
  endTimestamp?: number
  frames?: V2ActivityFrame[]
}): V2Activity {
  return {
    id: params?.id ?? 'activity-1',
    startTimestamp: params?.startTimestamp ?? 1_000,
    endTimestamp: params?.endTimestamp ?? 61_000,
    context: {
      appName: 'Code',
      bundleId: 'com.microsoft.VSCode',
      windowTitle: 'src/main/v2/activity-semantic-service.ts',
      tld: undefined,
    },
    interactions: [
      { type: 'keyboard', timestamp: (params?.startTimestamp ?? 1_000) + 1_000, keyCount: 12 },
      { type: 'scroll', timestamp: (params?.startTimestamp ?? 1_000) + 2_000 },
    ],
    frames: params?.frames ?? [],
    provenance: {
      eventWindowOffsets: [0],
      frameOffsets: (params?.frames ?? []).map((frame) => frame.offset),
      sourceWindowIds: ['window-1'],
      sourceClosedBy: ['flush'],
    },
  }
}

function response(summary: string, promptTokens = 10, completionTokens = 5): unknown {
  return {
    choices: [{ message: { content: summary } }],
    usage: { promptTokens, completionTokens },
  }
}

describe('V2ActivitySemanticService', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('creates OpenRouter client without serverURL by default', () => {
    new V2ActivitySemanticService('test-key', {
      usageTracker: { recordUsage: vi.fn() },
    })

    expect(OpenRouter).toHaveBeenCalledWith({ apiKey: 'test-key' })
  })

  it('passes serverURL to OpenRouter when custom endpoint is provided', () => {
    new V2ActivitySemanticService('test-key', {
      endpointConfig: {
        serverURL: 'http://localhost:11434/v1',
      },
      usageTracker: { recordUsage: vi.fn() },
    })

    expect(OpenRouter).toHaveBeenCalledWith({
      apiKey: 'test-key',
      serverURL: 'http://localhost:11434/v1',
    })
  })

  it('uses empty string as apiKey when custom endpoint has no key and no default key', () => {
    new V2ActivitySemanticService(undefined, {
      endpointConfig: {
        serverURL: 'http://localhost:11434/v1',
      },
      usageTracker: { recordUsage: vi.fn() },
    })

    expect(OpenRouter).toHaveBeenCalledWith({
      apiKey: '',
      serverURL: 'http://localhost:11434/v1',
    })
  })

  it('uses custom endpoint apiKey over OpenRouter key', () => {
    new V2ActivitySemanticService('openrouter-key', {
      endpointConfig: {
        serverURL: 'http://localhost:11434/v1',
        apiKey: 'custom-key',
      },
      usageTracker: { recordUsage: vi.fn() },
    })

    expect(OpenRouter).toHaveBeenCalledWith({
      apiKey: 'custom-key',
      serverURL: 'http://localhost:11434/v1',
    })
  })

  it('forwards configured custom model name in chat.send()', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)
    mockSend.mockResolvedValue(response('custom model summary'))

    const service = new V2ActivitySemanticService(undefined, {
      endpointConfig: {
        serverURL: 'http://localhost:11434/v1',
      },
      videoModels: ['my-custom-model'],
      snapshotModels: [],
      usageTracker: { recordUsage: vi.fn() },
    })

    await service.summarizeFromVideo({
      activity: makeActivity(),
      videoPath,
      ocrText: 'ignored',
    })

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ model: 'my-custom-model' }))
  })

  it('switches to custom endpoint via updateEndpoint()', () => {
    const service = new V2ActivitySemanticService('test-key', {
      usageTracker: { recordUsage: vi.fn() },
    })
    expect(service.isUsingCustomEndpoint()).toBe(false)

    service.updateEndpoint({
      serverURL: 'http://localhost:11434/v1',
      apiKey: 'custom-key',
    })

    expect(service.isUsingCustomEndpoint()).toBe(true)
    expect(service.isConfigured()).toBe(true)
    expect(OpenRouter).toHaveBeenLastCalledWith({
      apiKey: 'custom-key',
      serverURL: 'http://localhost:11434/v1',
    })
  })

  it('reverts from custom endpoint via updateEndpoint(null, openRouterKey)', () => {
    const service = new V2ActivitySemanticService(undefined, {
      endpointConfig: {
        serverURL: 'http://localhost:11434/v1',
      },
      usageTracker: { recordUsage: vi.fn() },
    })
    expect(service.isUsingCustomEndpoint()).toBe(true)

    service.updateEndpoint(null, 'openrouter-key')

    expect(service.isUsingCustomEndpoint()).toBe(false)
    expect(service.isConfigured()).toBe(true)
    expect(OpenRouter).toHaveBeenLastCalledWith({
      apiKey: 'openrouter-key',
    })
  })

  it('reverts to unconfigured when removing custom endpoint without OpenRouter key', () => {
    const service = new V2ActivitySemanticService(undefined, {
      endpointConfig: {
        serverURL: 'http://localhost:11434/v1',
      },
      usageTracker: { recordUsage: vi.fn() },
    })

    service.updateEndpoint(null)

    expect(service.isUsingCustomEndpoint()).toBe(false)
    expect(service.isConfigured()).toBe(false)
  })

  it('reports isConfigured() true when custom endpoint is set without OpenRouter key', () => {
    const service = new V2ActivitySemanticService(undefined, {
      endpointConfig: {
        serverURL: 'http://localhost:11434/v1',
      },
      usageTracker: { recordUsage: vi.fn() },
    })

    expect(service.isUsingCustomEndpoint()).toBe(true)
    expect(service.isConfigured()).toBe(true)
  })

  it('ignores updateApiKey when custom endpoint is active', () => {
    const service = new V2ActivitySemanticService(undefined, {
      endpointConfig: {
        serverURL: 'http://localhost:11434/v1',
      },
      usageTracker: { recordUsage: vi.fn() },
    })

    service.updateApiKey('new-key')

    expect(service.isUsingCustomEndpoint()).toBe(true)
  })

  it('uses first video model when it succeeds', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)

    const send = vi.fn().mockResolvedValue(response('video summary'))
    const usageTracker = { recordUsage: vi.fn() }

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      usageTracker,
    })

    const result = await service.summarizeFromVideo({
      activity: makeActivity(),
      videoPath,
      ocrText: 'ignored-ocr',
    })

    expect(result).toBe('video summary')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].model).toBe(DEFAULT_VIDEO_MODELS[0])
  })

  it('falls back through video models until one succeeds', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)

    const send = vi.fn().mockImplementation(async (request: { model: string }) => {
      if (request.model === DEFAULT_VIDEO_MODELS[0]) throw new Error('primary failed')
      if (request.model === DEFAULT_VIDEO_MODELS[1]) throw new Error('secondary failed')
      return response('third model summary')
    })

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      usageTracker: { recordUsage: vi.fn() },
    })

    const result = await service.summarizeFromVideo({
      activity: makeActivity(),
      videoPath,
      ocrText: 'ignored',
    })

    expect(result).toBe('third model summary')
    expect(send.mock.calls.map((call) => call[0].model)).toEqual(DEFAULT_VIDEO_MODELS)
  })

  it('falls from video pipeline to snapshot pipeline', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)

    const frames = [
      makeFrame(createImageFile(tempDir, 'f0.png'), 1_000, 0),
      makeFrame(createImageFile(tempDir, 'f1.png'), 25_000, 1),
      makeFrame(createImageFile(tempDir, 'f2.png'), 45_000, 2),
    ]

    const send = vi.fn().mockImplementation(async (request: { model: string }) => {
      if (DEFAULT_VIDEO_MODELS.includes(request.model)) {
        throw new Error('video model failure')
      }
      return response('snapshot summary')
    })

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      usageTracker: { recordUsage: vi.fn() },
    })

    const result = await service.summarizeFromVideo({
      activity: makeActivity({ frames }),
      videoPath,
      ocrText: 'ignored',
    })

    expect(result).toBe('snapshot summary')
    expect(send.mock.calls.map((call) => call[0].model)).toEqual([
      ...DEFAULT_VIDEO_MODELS,
      DEFAULT_SNAPSHOT_MODELS[0],
    ])

    const diagnostics = service.getLastRunDiagnostics()
    expect(diagnostics?.chosenMode).toBe('snapshot')
  })

  it('snapshot sampling obeys maxSnapshots=6', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)

    const frames: V2ActivityFrame[] = []
    for (let i = 0; i < 12; i++) {
      frames.push(makeFrame(createImageFile(tempDir, `frame-${i}.png`), 1_000 + i * 25_000, i))
    }

    const send = vi.fn().mockImplementation(async (request: { model: string }) => {
      if (DEFAULT_VIDEO_MODELS.includes(request.model)) {
        throw new Error('video fail')
      }
      return response('snapshot summary')
    })

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      maxSnapshots: 6,
      minSnapshotGapMs: 0,
      usageTracker: { recordUsage: vi.fn() },
    })

    await service.summarizeFromVideo({
      activity: makeActivity({ frames }),
      videoPath: path.join(tempDir, 'missing.mp4'),
      ocrText: 'ignored',
    })

    const diagnostics = service.getLastRunDiagnostics()
    expect(diagnostics?.selectedSnapshotPaths).toHaveLength(6)
  })

  it('snapshot sampling obeys minSnapshotGapMs=20_000', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)

    const frames = [
      makeFrame(createImageFile(tempDir, 'f0.png'), 0, 0),
      makeFrame(createImageFile(tempDir, 'f1.png'), 5_000, 1),
      makeFrame(createImageFile(tempDir, 'f2.png'), 20_000, 2),
      makeFrame(createImageFile(tempDir, 'f3.png'), 25_000, 3),
      makeFrame(createImageFile(tempDir, 'f4.png'), 40_000, 4),
      makeFrame(createImageFile(tempDir, 'f5.png'), 60_000, 5),
    ]

    const send = vi.fn().mockResolvedValue(response('snapshot summary'))

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      videoModels: ['video/fail'],
      snapshotModels: ['snapshot/success'],
      minSnapshotGapMs: 20_000,
      maxSnapshots: 10,
      usageTracker: { recordUsage: vi.fn() },
    })

    await service.summarizeFromVideo({
      activity: makeActivity({ frames, startTimestamp: 0, endTimestamp: 60_000 }),
      videoPath: path.join(tempDir, 'missing.mp4'),
      ocrText: 'ignored',
    })

    const diagnostics = service.getLastRunDiagnostics()
    expect(diagnostics?.selectedSnapshotPaths.map((filepath) => path.basename(filepath))).toEqual([
      'f0.png',
      'f2.png',
      'f4.png',
      'f5.png',
    ])
  })

  it('snapshot sampling always includes first and last when available', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)

    const frames = [
      makeFrame(createImageFile(tempDir, 'first.png'), 1_000, 0),
      makeFrame(createImageFile(tempDir, 'middle-a.png'), 5_000, 1),
      makeFrame(createImageFile(tempDir, 'middle-b.png'), 10_000, 2),
      makeFrame(createImageFile(tempDir, 'last.png'), 30_000, 3),
    ]

    const send = vi.fn().mockResolvedValue(response('snapshot summary'))

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      videoModels: ['video/fail'],
      snapshotModels: ['snapshot/success'],
      minSnapshotGapMs: 20_000,
      maxSnapshots: 3,
      usageTracker: { recordUsage: vi.fn() },
    })

    await service.summarizeFromVideo({
      activity: makeActivity({ frames }),
      videoPath: path.join(tempDir, 'missing.mp4'),
      ocrText: 'ignored',
    })

    const diagnostics = service.getLastRunDiagnostics()
    expect(diagnostics?.selectedSnapshotPaths.map((filepath) => path.basename(filepath))).toContain(
      'first.png',
    )
    expect(diagnostics?.selectedSnapshotPaths.map((filepath) => path.basename(filepath))).toContain(
      'last.png',
    )
  })

  it('never sends OCR text to the LLM payload', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)

    const send = vi.fn().mockResolvedValue(response('summary'))

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      usageTracker: { recordUsage: vi.fn() },
    })

    await service.summarizeFromVideo({
      activity: makeActivity(),
      videoPath,
      ocrText: 'VERY_SECRET_OCR_TEXT',
    })

    expect(JSON.stringify(send.mock.calls[0][0])).not.toContain('VERY_SECRET_OCR_TEXT')
  })

  it('trims summary output', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)

    const send = vi.fn().mockResolvedValue(response('  trimmed summary  '))

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      usageTracker: { recordUsage: vi.fn() },
    })

    const result = await service.summarizeFromVideo({
      activity: makeActivity(),
      videoPath,
      ocrText: 'ignored',
    })

    expect(result).toBe('trimmed summary')
  })

  it('records usage stats on success', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)

    const send = vi.fn().mockResolvedValue(response('summary', 123, 45))
    const usageTracker = { recordUsage: vi.fn() }

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      videoModels: ['mistralai/mistral-small-3.2-24b-instruct'],
      usageTracker,
    })

    await service.summarizeFromVideo({
      activity: makeActivity(),
      videoPath,
      ocrText: 'ignored',
    })

    expect(usageTracker.recordUsage).toHaveBeenCalledTimes(1)
    expect(usageTracker.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_tokens: 123,
        completion_tokens: 45,
      }),
    )
  })

  it('records unknown model cost as 0', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)

    const send = vi.fn().mockResolvedValue(response('summary', 200, 100))
    const usageTracker = { recordUsage: vi.fn() }

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      videoModels: ['unknown/video-model'],
      usageTracker,
    })

    await service.summarizeFromVideo({
      activity: makeActivity(),
      videoPath,
      ocrText: 'ignored',
    })

    expect(usageTracker.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_tokens: 200,
        completion_tokens: 100,
        cost: 0,
      }),
    )
  })

  it('returns empty summary when all models fail', async () => {
    const tempDir = createTempDir()
    tempDirs.push(tempDir)
    const videoPath = createVideoFile(tempDir)

    const frames = [makeFrame(createImageFile(tempDir, 'f0.png'), 1_000, 0)]

    const send = vi.fn().mockRejectedValue(new Error('all failed'))

    const service = new V2ActivitySemanticService(undefined, {
      client: { chat: { send } },
      usageTracker: { recordUsage: vi.fn() },
    })

    const result = await service.summarizeFromVideo({
      activity: makeActivity({ frames }),
      videoPath,
      ocrText: 'ignored',
    })

    expect(result).toBe('')
    const diagnostics = service.getLastRunDiagnostics()
    expect(diagnostics?.attempts).toHaveLength(
      DEFAULT_VIDEO_MODELS.length + DEFAULT_SNAPSHOT_MODELS.length,
    )
  })
})
