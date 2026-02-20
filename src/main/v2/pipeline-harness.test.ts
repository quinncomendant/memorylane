import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { V2Activity } from './activity-types'
import type { StreamSubscription } from './streams/stream'
import { createV2PipelineHarness } from './pipeline-harness'

vi.mock('../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

let screenshotCount = 0
vi.mock('./recorder/native-screenshot', () => ({
  captureDesktop: vi.fn(async ({ outputPath }: { outputPath: string }) => ({
    filepath: outputPath,
    width: 1280,
    height: 720,
    displayId: 1,
    token: screenshotCount++,
  })),
}))

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 2_000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await sleep(10)
  }
  throw new Error(message)
}

describe('v2 pipeline harness', () => {
  const subscriptions: StreamSubscription[] = []

  afterEach(() => {
    screenshotCount = 0
    for (const sub of subscriptions.splice(0)) {
      sub.unsubscribe()
    }
  })

  it('wires screen + event + activity producer with in-memory streams', async () => {
    const harness = createV2PipelineHarness({
      outputDir: path.join(process.cwd(), '.tmp-v2-harness'),
      frameIntervalMs: 10,
      activityProducerConfig: {
        frameJoinGraceMs: 0,
        maxFrameWaitMs: 0,
        minActivityDurationMs: 0,
        eventConsumerId: 'harness:event',
        frameConsumerId: 'harness:frame',
      },
    })

    const activities: V2Activity[] = []
    subscriptions.push(
      harness.activityStream.subscribe({
        startAt: { type: 'now' },
        onRecord: (record) => activities.push(record.payload),
      }),
    )

    await harness.start()

    const startTs = Date.now()
    harness.handleEvent({
      type: 'app_change',
      timestamp: startTs,
      activeWindow: {
        title: 'Harness Window',
        processName: 'Code',
        bundleId: 'com.microsoft.VSCode',
      },
    })

    await sleep(60)
    harness.handleEvent({
      type: 'keyboard',
      timestamp: Date.now(),
      keyCount: 3,
      durationMs: 60,
    })
    harness.eventCapturer.flush()

    await waitFor(() => activities.length >= 1, 'Expected activity emitted from harness wiring')
    expect(activities[0].frames.length).toBeGreaterThan(0)
    expect(activities[0].context.appName).toBe('Code')
    expect(harness.activityProducer.getStats().emittedActivities).toBeGreaterThanOrEqual(1)

    await harness.stop()
  })
})
