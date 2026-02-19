import * as fs from 'fs'
import * as path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureDesktop } from './native-screenshot'

const RUN_INTEGRATION =
  process.platform === 'darwin' && process.env.RUN_NATIVE_SCREENSHOT_INTEGRATION === '1'
const describeIntegration = RUN_INTEGRATION ? describe.sequential : describe.skip

const SCREENSHOT_BINARY_PATH = path.resolve(process.cwd(), 'build', 'swift', 'screenshot')
const OUTPUT_ROOT_DIR = path.resolve(process.cwd(), '.debug-native-screenshot')
const RUN_OUTPUT_DIR = path.join(OUTPUT_ROOT_DIR, new Date().toISOString().replace(/[:.]/g, '-'))

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let previousExecutableOverride: string | undefined

function assertPng(pathname: string): void {
  expect(fs.existsSync(pathname)).toBe(true)
  const bytes = fs.readFileSync(pathname)
  expect(bytes.length).toBeGreaterThan(PNG_SIGNATURE.length)
  expect(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true)
}

describeIntegration('native screenshot integration', () => {
  beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_BINARY_PATH)) {
      throw new Error(
        `Missing screenshot binary at ${SCREENSHOT_BINARY_PATH}. Run "npm run build:swift" first.`,
      )
    }

    fs.mkdirSync(RUN_OUTPUT_DIR, { recursive: true })
    previousExecutableOverride = process.env.MEMORYLANE_SCREENSHOT_EXECUTABLE
    process.env.MEMORYLANE_SCREENSHOT_EXECUTABLE = SCREENSHOT_BINARY_PATH
  })

  afterAll(() => {
    if (previousExecutableOverride === undefined) {
      delete process.env.MEMORYLANE_SCREENSHOT_EXECUTABLE
    } else {
      process.env.MEMORYLANE_SCREENSHOT_EXECUTABLE = previousExecutableOverride
    }
  })

  it('captures a real desktop screenshot using compiled swift binary', async () => {
    const outputPath = path.join(RUN_OUTPUT_DIR, 'desktop.png')
    const result = await captureDesktop({ outputPath })

    expect(result.filepath).toBe(outputPath)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    assertPng(outputPath)
  })

  it('captures a screenshot for an explicitly requested display id', async () => {
    const baselinePath = path.join(RUN_OUTPUT_DIR, 'baseline-display.png')
    const baselineCapture = await captureDesktop({ outputPath: baselinePath })
    assertPng(baselinePath)

    const explicitOutputPath = path.join(RUN_OUTPUT_DIR, 'explicit-display.png')
    const explicitCapture = await captureDesktop({
      outputPath: explicitOutputPath,
      displayId: baselineCapture.displayId,
    })

    expect(explicitCapture.filepath).toBe(explicitOutputPath)
    expect(explicitCapture.displayId).toBe(baselineCapture.displayId)
    expect(explicitCapture.width).toBeGreaterThan(0)
    expect(explicitCapture.height).toBeGreaterThan(0)
    assertPng(explicitOutputPath)
  })

  it('prints where screenshots were saved for manual inspection', () => {
    expect(fs.existsSync(path.join(RUN_OUTPUT_DIR, 'desktop.png'))).toBe(true)
    expect(fs.existsSync(path.join(RUN_OUTPUT_DIR, 'explicit-display.png'))).toBe(true)
    console.log(`[NativeScreenshotIntegration] Saved captures in: ${RUN_OUTPUT_DIR}`)
  })
})
