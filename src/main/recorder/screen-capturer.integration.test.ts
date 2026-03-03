import * as fs from 'fs'
import * as path from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Frame, ScreenCapturer } from './screen-capturer'
import { InMemoryStream } from '../streams/in-memory-stream'
import type { StreamSubscription } from '../streams/stream'

const RUN_INTEGRATION =
  process.platform === 'darwin' && process.env.RUN_NATIVE_SCREENSHOT_INTEGRATION === '1'
const describeIntegration = RUN_INTEGRATION ? describe.sequential : describe.skip

const SCREENSHOT_BINARY_PATH = path.resolve(process.cwd(), 'build', 'swift', 'screenshot')
const OUTPUT_ROOT_DIR = path.resolve(process.cwd(), '.debug-screen-capturer')
const RUN_OUTPUT_DIR = path.join(OUTPUT_ROOT_DIR, new Date().toISOString().replace(/[:.]/g, '-'))

const JPEG_SOI = Buffer.from([0xff, 0xd8])

function assertJpeg(pathname: string): void {
  expect(fs.existsSync(pathname)).toBe(true)
  const bytes = fs.readFileSync(pathname)
  expect(bytes.length).toBeGreaterThan(JPEG_SOI.length)
  expect(bytes.subarray(0, JPEG_SOI.length).equals(JPEG_SOI)).toBe(true)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function flushAsyncAppends(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function settleAfterStop(): Promise<void> {
  await sleep(700)
  await flushAsyncAppends()
}

describeIntegration('screen capturer integration', () => {
  let capturer: ScreenCapturer | null = null
  let subscriptions: StreamSubscription[] = []

  beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_BINARY_PATH)) {
      throw new Error(
        `Missing screenshot binary at ${SCREENSHOT_BINARY_PATH}. Run "npm run build:swift" first.`,
      )
    }

    fs.mkdirSync(RUN_OUTPUT_DIR, { recursive: true })
  })

  beforeEach(() => {
    subscriptions = []
  })

  afterEach(() => {
    if (capturer) {
      capturer.stop()
      capturer = null
    }
    for (const sub of subscriptions) {
      sub.unsubscribe()
    }
    subscriptions = []
  })

  afterAll(() => {
    delete process.env.MEMORYLANE_SCREENSHOT_EXECUTABLE
  })

  it('captures frames at regular intervals', async () => {
    const outputDir = path.join(RUN_OUTPUT_DIR, 'interval-test')
    const stream = new InMemoryStream<Frame>()
    capturer = new ScreenCapturer({ intervalMs: 500, outputDir, stream })
    const frames: Frame[] = []
    subscriptions.push(
      stream.subscribe({
        startAt: { type: 'now' },
        onRecord: (record) => frames.push(record.payload),
      }),
    )

    capturer.start()
    await sleep(3000)
    capturer.stop()
    await settleAfterStop()

    expect(frames.length).toBeGreaterThanOrEqual(3)
    expect(frames.length).toBeLessThanOrEqual(8)

    for (const frame of frames) {
      assertJpeg(frame.filepath)
      expect(frame.width).toBeGreaterThan(0)
      expect(frame.height).toBeGreaterThan(0)
      expect(frame.timestamp).toBeGreaterThan(0)
      expect(frame.displayId).toBeGreaterThan(0)
    }

    // Sequence numbers are monotonically increasing from 0
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i].sequenceNumber).toBe(i)
    }
  }, 15_000)

  it('stop halts capture', async () => {
    const outputDir = path.join(RUN_OUTPUT_DIR, 'stop-test')
    const stream = new InMemoryStream<Frame>()
    capturer = new ScreenCapturer({ intervalMs: 500, outputDir, stream })
    const frames: Frame[] = []
    subscriptions.push(
      stream.subscribe({
        startAt: { type: 'now' },
        onRecord: (record) => frames.push(record.payload),
      }),
    )

    capturer.start()
    await sleep(1500)
    capturer.stop()
    await settleAfterStop()
    const countAfterStop = frames.length

    await sleep(1000)
    await flushAsyncAppends()
    expect(frames.length).toBe(countAfterStop)
    expect(capturer.capturing).toBe(false)
  }, 10_000)

  it('multiple subscribers receive the same frames', async () => {
    const outputDir = path.join(RUN_OUTPUT_DIR, 'multi-subscriber-test')
    const stream = new InMemoryStream<Frame>()
    capturer = new ScreenCapturer({ intervalMs: 500, outputDir, stream })
    const framesA: Frame[] = []
    const framesB: Frame[] = []
    subscriptions.push(
      stream.subscribe({
        startAt: { type: 'now' },
        onRecord: (record) => framesA.push(record.payload),
      }),
    )
    subscriptions.push(
      stream.subscribe({
        startAt: { type: 'now' },
        onRecord: (record) => framesB.push(record.payload),
      }),
    )

    capturer.start()
    await sleep(2500)
    capturer.stop()
    await settleAfterStop()

    expect(framesA.length).toBeGreaterThanOrEqual(1)
    expect(framesA.length).toBe(framesB.length)

    for (let i = 0; i < framesA.length; i++) {
      expect(framesA[i].filepath).toBe(framesB[i].filepath)
      expect(framesA[i].sequenceNumber).toBe(framesB[i].sequenceNumber)
    }
  }, 10_000)

  it('unsubscribe stops delivery for that subscriber', async () => {
    const outputDir = path.join(RUN_OUTPUT_DIR, 'unsubscribe-test')
    const stream = new InMemoryStream<Frame>()
    capturer = new ScreenCapturer({ intervalMs: 500, outputDir, stream })
    const framesA: Frame[] = []
    const framesB: Frame[] = []
    const subA = stream.subscribe({
      startAt: { type: 'now' },
      onRecord: (record) => framesA.push(record.payload),
    })
    const subB = stream.subscribe({
      startAt: { type: 'now' },
      onRecord: (record) => framesB.push(record.payload),
    })
    subscriptions.push(subA, subB)

    subA.unsubscribe()

    capturer.start()
    await sleep(1500)
    capturer.stop()
    await settleAfterStop()

    expect(framesA.length).toBe(0)
    expect(framesB.length).toBeGreaterThanOrEqual(1)
  }, 10_000)

  it('start is idempotent', async () => {
    const outputDir = path.join(RUN_OUTPUT_DIR, 'idempotent-test')
    const stream = new InMemoryStream<Frame>()
    capturer = new ScreenCapturer({ intervalMs: 500, outputDir, stream })
    const frames: Frame[] = []
    subscriptions.push(
      stream.subscribe({
        startAt: { type: 'now' },
        onRecord: (record) => frames.push(record.payload),
      }),
    )

    capturer.start()
    capturer.start() // second call should be no-op
    await sleep(2500)
    capturer.stop()
    await settleAfterStop()

    // If start wasn't idempotent, we'd see double the frames
    expect(frames.length).toBeGreaterThanOrEqual(1)
    expect(frames.length).toBeLessThanOrEqual(8)

    // Sequence numbers should still be sequential (no duplicates)
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i].sequenceNumber).toBe(i)
    }
  }, 10_000)

  it('prints where screenshots were saved for manual inspection', () => {
    console.log(`[ScreenCapturerIntegration] Saved captures in: ${RUN_OUTPUT_DIR}`)
  })
})
