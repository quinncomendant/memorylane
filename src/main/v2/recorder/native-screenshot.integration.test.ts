import * as fs from 'fs'
import * as path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ScreenshotDaemon, type CapturedFrame } from './native-screenshot'

const RUN_INTEGRATION =
  process.platform === 'darwin' && process.env.RUN_NATIVE_SCREENSHOT_INTEGRATION === '1'
const describeIntegration = RUN_INTEGRATION ? describe.sequential : describe.skip

const SCREENSHOT_BINARY_PATH = path.resolve(process.cwd(), 'build', 'swift', 'screenshot')
const OUTPUT_ROOT_DIR = path.resolve(process.cwd(), '.debug-native-screenshot')
const RUN_OUTPUT_DIR = path.join(OUTPUT_ROOT_DIR, new Date().toISOString().replace(/[:.]/g, '-'))

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

function assertJpeg(pathname: string): void {
  expect(fs.existsSync(pathname)).toBe(true)
  const bytes = fs.readFileSync(pathname)
  expect(bytes.length).toBeGreaterThan(JPEG_SIGNATURE.length)
  expect(bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)).toBe(true)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describeIntegration('native screenshot daemon integration', () => {
  let daemon: ScreenshotDaemon
  const receivedFrames: CapturedFrame[] = []

  beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_BINARY_PATH)) {
      throw new Error(
        `Missing screenshot binary at ${SCREENSHOT_BINARY_PATH}. Run "npm run build:swift" first.`,
      )
    }

    fs.mkdirSync(RUN_OUTPUT_DIR, { recursive: true })

    daemon = new ScreenshotDaemon()
    await daemon.start({
      outputDir: RUN_OUTPUT_DIR,
      intervalMs: 500,
      maxDimensionPx: 1920,
      onFrame: (frame) => {
        receivedFrames.push(frame)
      },
    })
  })

  afterAll(async () => {
    await daemon.stop()
    delete process.env.MEMORYLANE_SCREENSHOT_EXECUTABLE
  })

  it('autonomously captures frames and pushes them via onFrame', async () => {
    // Wait for a few frames to arrive
    const startCount = receivedFrames.length
    await sleep(2000)

    const newFrames = receivedFrames.slice(startCount)
    expect(newFrames.length).toBeGreaterThanOrEqual(2)

    for (const frame of newFrames) {
      expect(frame.filepath).toBeTruthy()
      expect(frame.width).toBeGreaterThan(0)
      expect(frame.height).toBeGreaterThan(0)
      expect(frame.timestamp).toBeGreaterThan(0)
      expect(frame.displayId).toBeGreaterThan(0)
      expect(Math.max(frame.width, frame.height)).toBeLessThanOrEqual(1920)
      assertJpeg(frame.filepath)
    }
  }, 10_000)

  it('accepts displayId command via send', async () => {
    // Grab current display ID from a received frame
    expect(receivedFrames.length).toBeGreaterThan(0)
    const currentDisplayId = receivedFrames[receivedFrames.length - 1].displayId

    // Send same display ID (should not crash)
    daemon.send({ displayId: currentDisplayId })
    await sleep(1500)

    // Frames should still be arriving
    const recentFrame = receivedFrames[receivedFrames.length - 1]
    expect(recentFrame.displayId).toBe(currentDisplayId)
  }, 10_000)

  it('prints where screenshots were saved for manual inspection', () => {
    expect(receivedFrames.length).toBeGreaterThan(0)
    console.log(`[NativeScreenshotIntegration] Saved captures in: ${RUN_OUTPUT_DIR}`)
  })
})
